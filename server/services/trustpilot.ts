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

      const data = res.data;
      // Attempt to normalize common shapes for company-details
      const averageRating = data?.rating?.average
        || data?.averageRating
        || data?.trustScore
        || data?.rating
        || data?.ratingValue
        || undefined;
      const totalReviews = data?.rating?.count
        || data?.reviewsCount
        || data?.numberOfReviews
        || data?.totalReviews
        || (Array.isArray(data?.reviews) ? data.reviews.length : undefined);
      const reviewsArray: any[] = Array.isArray(data?.reviews) ? data.reviews : [];

      const reviews: TrustpilotReview[] = reviewsArray.map((r: any) => ({
        reviewTitle: r.title || r.reviewTitle,
        reviewText: r.text || r.reviewText || r.content,
        reviewUrl: r.url || r.reviewUrl || r.link,
        rating: r.rating || r.stars || r.score,
        date: r.date || r.publishedAt || r.time,
        author: r.author || r.user || r.username,
      }));

      const sourceUrl = data?.companyProfileUrl || (domain ? `https://www.trustpilot.com/review/${domain}` : undefined);
      console.log('[Trustpilot] Fetched (company-details)', {
        domain,
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
