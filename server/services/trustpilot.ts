import axios from 'axios';

interface TrustpilotReview {
  reviewTitle?: string;
  reviewText?: string;
  reviewUrl?: string;
  rating?: number; // 1-5
  date?: string;
  author?: string;
}

export interface TrustpilotSummary {
  platform: 'trustpilot';
  averageRating?: number;
  totalReviews?: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // 0-100
  topQuotes: Array<{ text: string; url?: string; rating?: number }>;
  summary: string; // filled by aggregator's OpenAI step
}

function ratingToSentiment(rating?: number): 'positive' | 'neutral' | 'negative' {
  if (rating == null) return 'neutral';
  if (rating >= 4) return 'positive';
  if (rating >= 2.5) return 'neutral';
  return 'negative';
}

export const trustpilotService = {
  async getCompanyReviewsByDomain(domain: string): Promise<{ averageRating?: number; totalReviews?: number; reviews: TrustpilotReview[]; sourceUrl?: string; } | null> {
    if (!domain) return null;

    const apiKey = process.env.TRUSTPILOT_RAPIDAPI_KEY || process.env.RAPIDAPI_TRUSTPILOT_KEY || process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      console.warn('[Trustpilot] Missing RapidAPI key (set TRUSTPILOT_RAPIDAPI_KEY)');
      return null;
    }

    const host = 'trustpilot-company-and-reviews-data.p.rapidapi.com';
    // Use company-details endpoint as requested
    const url = `https://${host}/company-details`;

    try {
      const res = await axios.get(url, {
        params: {
          company_domain: domain,
          locale: 'en-US',
        },
        headers: {
          'x-rapidapi-host': host,
          'x-rapidapi-key': apiKey,
        },
        timeout: 15000,
      });

      let payload: any = res.data;
      // Some providers may return stringified JSON
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { /* ignore */ }
      }
      // Or wrap the JSON under a `body` field as a string
      if (payload && typeof payload.body === 'string') {
        try { payload = JSON.parse(payload.body); } catch { /* ignore */ }
      }
      const data = payload?.data ?? payload; // some providers wrap in { status, parameters, data }
      const company = data?.company ?? data; // company-details provider nests values under data.company
      // Attempt to normalize common shapes for company-details
      const avgRaw = company?.rating?.average
        ?? company?.averageRating
        ?? company?.trustScore
        ?? company?.trust_score
        ?? company?.rating
        ?? company?.ratingValue
        ?? data?.rating?.average
        ?? data?.averageRating
        ?? data?.trustScore
        ?? data?.trust_score
        ?? data?.rating
        ?? data?.ratingValue;
      const averageRating = avgRaw != null ? Number(avgRaw) : undefined;

      const totalRaw = company?.rating?.count
        ?? company?.reviewsCount
        ?? company?.numberOfReviews
        ?? company?.totalReviews
        ?? company?.review_count
        ?? data?.rating?.count
        ?? data?.reviewsCount
        ?? data?.numberOfReviews
        ?? data?.totalReviews
        ?? data?.review_count
        ?? (Array.isArray(data?.reviews) ? data.reviews.length : undefined);
      const totalReviews = totalRaw != null ? Number(totalRaw) : undefined;
      const reviewsArray: any[] = Array.isArray(data?.reviews) ? data.reviews : [];

      const reviews: TrustpilotReview[] = reviewsArray.map((r: any) => ({
        reviewTitle: r.title || r.reviewTitle,
        reviewText: r.text || r.reviewText || r.content,
        reviewUrl: r.url || r.reviewUrl || r.link,
        rating: r.rating || r.stars || r.score,
        date: r.date || r.publishedAt || r.time,
        author: r.author || r.user || r.username,
      }));

      const sourceUrl = data?.companyProfileUrl || (company?.domain ? `https://www.trustpilot.com/review/${company.domain}` : (domain ? `https://www.trustpilot.com/review/${domain}` : undefined));
      console.log('[Trustpilot] Fetched (company-details)', {
        domain,
        parsedDomain: company?.domain || domain,
        averageRating,
        totalReviews,
        reviewCount: reviews.length,
        sourceUrl,
      });
      return { averageRating, totalReviews, reviews, sourceUrl };
    } catch (err: any) {
      console.error('[Trustpilot] Error fetching reviews:', err?.response?.data || err?.message || err);
      return null;
    }
  },
};
