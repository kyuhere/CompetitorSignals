import axios from 'axios';

export interface G2Review {
  rating: number;
  title: string;
  comment: string;
  author: string;
  verified: boolean;
  date: string;
  pros: string[];
  cons: string[];
}

export interface G2ProductData {
  product_name: string;
  overall_rating: number;
  total_reviews: number;
  reviews: G2Review[];
  category: string;
  url: string;
}

export interface G2Response {
  success: boolean;
  data: G2ProductData;
  error?: string;
}

export class G2Service {
  private readonly rapidApiKey: string;
  private readonly rapidApiHost = 'g2-data-api.p.rapidapi.com';

  constructor() {
    this.rapidApiKey = process.env.RAPIDAPI_KEY || '';
    if (!this.rapidApiKey) {
      console.warn('RAPIDAPI_KEY not found in environment variables');
    }
  }

  async getProductReviews(productName: string, maxReviews: number = 20): Promise<G2Response> {
    try {
      if (!this.rapidApiKey) {
        return {
          success: false,
          error: 'RapidAPI key not configured',
          data: this.getEmptyProductData(productName)
        };
      }

      const response = await axios.get(`https://${this.rapidApiHost}/g2-products`, {
        params: {
          product: productName.toLowerCase(),
          max_reviews: Math.min(maxReviews, 100) // Cap at 100 for safety
        },
        headers: {
          'x-rapidapi-host': this.rapidApiHost,
          'x-rapidapi-key': this.rapidApiKey
        },
        timeout: 15000 // 15 second timeout
      });

      if (response.data && response.data.success) {
        return {
          success: true,
          data: this.normalizeProductData(response.data.data, productName)
        };
      } else {
        return {
          success: false,
          error: response.data?.error || 'No data returned from G2 API',
          data: this.getEmptyProductData(productName)
        };
      }

    } catch (error) {
      console.error(`G2 API error for ${productName}:`, error);
      
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const message = error.response?.data?.message || error.message;
        
        return {
          success: false,
          error: `G2 API failed (${statusCode}): ${message}`,
          data: this.getEmptyProductData(productName)
        };
      }

      return {
        success: false,
        error: `Unknown error: ${String(error)}`,
        data: this.getEmptyProductData(productName)
      };
    }
  }

  private normalizeProductData(rawData: any, productName: string): G2ProductData {
    return {
      product_name: rawData.product_name || productName,
      overall_rating: Number(rawData.overall_rating) || 0,
      total_reviews: Number(rawData.total_reviews) || 0,
      reviews: this.normalizeReviews(rawData.reviews || []),
      category: rawData.category || 'Software',
      url: rawData.url || `https://www.g2.com/products/${productName.toLowerCase().replace(/\s+/g, '-')}`
    };
  }

  private normalizeReviews(rawReviews: any[]): G2Review[] {
    return rawReviews.map(review => ({
      rating: Number(review.rating) || 0,
      title: String(review.title || '').trim(),
      comment: String(review.comment || review.review || '').trim(),
      author: String(review.author || review.reviewer || 'Anonymous').trim(),
      verified: Boolean(review.verified || review.verified_purchase),
      date: review.date || review.created_at || new Date().toISOString().split('T')[0],
      pros: Array.isArray(review.pros) ? review.pros : [],
      cons: Array.isArray(review.cons) ? review.cons : []
    })).filter(review => review.comment.length > 10); // Filter out very short reviews
  }

  private getEmptyProductData(productName: string): G2ProductData {
    return {
      product_name: productName,
      overall_rating: 0,
      total_reviews: 0,
      reviews: [],
      category: 'Software',
      url: `https://www.g2.com/products/${productName.toLowerCase().replace(/\s+/g, '-')}`
    };
  }

  // Utility method to get summary data for competitor reports
  async getProductSummary(productName: string): Promise<{
    averageRating: number;
    totalReviews: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    topReviewQuotes: string[];
    category: string;
    g2Url: string;
  }> {
    const result = await this.getProductReviews(productName, 50);
    
    const data = result.data;
    const sentiment = this.calculateSentiment(data.overall_rating);
    const topQuotes = this.extractTopQuotes(data.reviews);

    return {
      averageRating: data.overall_rating,
      totalReviews: data.total_reviews,
      sentiment,
      topReviewQuotes: topQuotes,
      category: data.category,
      g2Url: data.url
    };
  }

  private calculateSentiment(rating: number): 'positive' | 'neutral' | 'negative' {
    if (rating >= 4.0) return 'positive';
    if (rating >= 3.0) return 'neutral';
    return 'negative';
  }

  private extractTopQuotes(reviews: G2Review[]): string[] {
    return reviews
      .filter(review => review.comment && review.comment.length > 20)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3)
      .map(review => review.comment.substring(0, 150) + (review.comment.length > 150 ? '...' : ''));
  }
}

export const g2Service = new G2Service();