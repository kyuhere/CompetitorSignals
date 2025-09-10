import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ThumbsUp, ThumbsDown, Minus, Star, MessageCircle, ExternalLink } from "lucide-react";

interface Quote {
  text: string;
  author?: string;
  source?: string;
  url?: string;
  rating?: number;
}

interface SentimentData {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // 0-100
  totalMentions: number;
  quotes: Quote[];
}

interface ReviewData {
  averageRating: number;
  totalReviews: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  topQuotes: Quote[];
}

interface SocialMediaData {
  sentiment: 'positive' | 'negative' | 'neutral';
  totalMentions: number;
  platforms: string[];
  topQuotes: Quote[];
}

interface SocialSentimentProps {
  reviews?: ReviewData;
  socialMedia?: SocialMediaData;
  query: string;
}

function getSentimentColor(sentiment: 'positive' | 'negative' | 'neutral'): string {
  switch (sentiment) {
    case 'positive':
      return 'text-green-600 dark:text-green-400';
    case 'negative':
      return 'text-red-600 dark:text-red-400';
    case 'neutral':
      return 'text-gray-600 dark:text-gray-400';
  }
}

function getSentimentIcon(sentiment: 'positive' | 'negative' | 'neutral') {
  switch (sentiment) {
    case 'positive':
      return <ThumbsUp className="w-4 h-4" />;
    case 'negative':
      return <ThumbsDown className="w-4 h-4" />;
    case 'neutral':
      return <Minus className="w-4 h-4" />;
  }
}

function getSentimentBadgeVariant(sentiment: 'positive' | 'negative' | 'neutral'): "default" | "destructive" | "secondary" {
  switch (sentiment) {
    case 'positive':
      return 'default';
    case 'negative':
      return 'destructive';
    case 'neutral':
      return 'secondary';
  }
}

export default function SocialSentiment({ reviews, socialMedia, query }: SocialSentimentProps) {
  const hasData = reviews || socialMedia;

  if (!hasData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Social Sentiment Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No social sentiment data available for "{query}"
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reviews Section */}
      {reviews && (
        <Card className="w-full" data-testid="card-reviews-sentiment">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Reviews & Ratings
              <Badge variant={getSentimentBadgeVariant(reviews.sentiment)} className="ml-auto">
                <span className={`flex items-center gap-1 ${getSentimentColor(reviews.sentiment)}`}>
                  {getSentimentIcon(reviews.sentiment)}
                  {reviews.sentiment.charAt(0).toUpperCase() + reviews.sentiment.slice(1)}
                </span>
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Average Rating */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.floor(reviews.averageRating) 
                          ? 'text-yellow-400 fill-yellow-400' 
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-semibold" data-testid="text-average-rating">
                  {reviews.averageRating.toFixed(1)}
                </span>
              </div>
              <span className="text-sm text-muted-foreground" data-testid="text-total-reviews">
                {reviews.totalReviews} reviews
              </span>
            </div>

            {/* Rating Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Rating Score</span>
                <span>{Math.round((reviews.averageRating / 5) * 100)}%</span>
              </div>
              <Progress value={(reviews.averageRating / 5) * 100} className="h-2" />
            </div>

            {/* Top Review Quotes */}
            {reviews.topQuotes && reviews.topQuotes.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-foreground">Top Review Quotes</h4>
                {reviews.topQuotes.slice(0, 3).map((quote, index) => (
                  <blockquote key={index} className="border-l-3 border-yellow-400 pl-4 space-y-2">
                    <p className="text-sm italic text-muted-foreground">"{quote.text}"</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {quote.author && <span>— {quote.author}</span>}
                        {quote.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <span>{quote.rating}</span>
                          </div>
                        )}
                      </div>
                      {quote.url && (
                        <a 
                          href={quote.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:text-primary/80"
                          data-testid={`link-review-${index}`}
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </blockquote>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Social Media Section */}
      {socialMedia && (
        <Card className="w-full" data-testid="card-social-sentiment">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-500" />
              Social Media Sentiment
              <Badge variant={getSentimentBadgeVariant(socialMedia.sentiment)} className="ml-auto">
                <span className={`flex items-center gap-1 ${getSentimentColor(socialMedia.sentiment)}`}>
                  {getSentimentIcon(socialMedia.sentiment)}
                  {socialMedia.sentiment.charAt(0).toUpperCase() + socialMedia.sentiment.slice(1)}
                </span>
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Social Stats */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Total Mentions:</span>
                <span className="font-semibold" data-testid="text-total-mentions">
                  {socialMedia.totalMentions}
                </span>
              </div>
              {socialMedia.platforms && socialMedia.platforms.length > 0 && (
                <div className="flex gap-1">
                  {socialMedia.platforms.slice(0, 3).map((platform, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {platform}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Top Social Quotes */}
            {socialMedia.topQuotes && socialMedia.topQuotes.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-foreground">Recent Mentions</h4>
                {socialMedia.topQuotes.slice(0, 3).map((quote, index) => (
                  <blockquote key={index} className="border-l-3 border-blue-400 pl-4 space-y-2">
                    <p className="text-sm italic text-muted-foreground">"{quote.text}"</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {quote.author && <span>— {quote.author}</span>}
                        {quote.source && (
                          <Badge variant="outline" className="text-xs">
                            {quote.source}
                          </Badge>
                        )}
                      </div>
                      {quote.url && (
                        <a 
                          href={quote.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:text-primary/80"
                          data-testid={`link-social-${index}`}
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </blockquote>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Footer */}
      {hasData && (
        <div className="text-center text-xs text-muted-foreground">
          <p>Sentiment analysis powered by OpenAI for "{query}"</p>
        </div>
      )}
    </div>
  );
}