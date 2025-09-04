import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, TrendingUp, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold text-foreground">AI Competitor Signals</span>
            </div>
            
            <Button 
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-login"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-6">
            Track Your Competitors with 
            <span className="text-primary"> AI Intelligence</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            Get actionable insights from news, funding, and social signals. 
            Generate professional competitive intelligence reports in minutes.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-get-started"
            >
              Get Started Free
            </Button>
            <Button variant="outline" size="lg" data-testid="button-learn-more">
              Learn More
            </Button>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="secondary">No Credit Card Required</Badge>
            <Badge variant="secondary">5 Competitors per Analysis</Badge>
            <Badge variant="secondary">AI-Powered Insights</Badge>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">
            Everything You Need for Competitive Intelligence
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Signal Aggregation</h3>
                <p className="text-muted-foreground">
                  Automatically collect news, funding announcements, and social mentions from multiple sources.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">AI Analysis</h3>
                <p className="text-muted-foreground">
                  Get intelligent summaries and strategic insights powered by advanced AI models.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Team Ready</h3>
                <p className="text-muted-foreground">
                  Share reports with your team and keep track of competitive landscapes over time.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">
            Simple, Transparent Pricing
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-foreground mb-2">Free</h3>
                  <p className="text-3xl font-bold text-primary mb-4">$0<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                  
                  <ul className="text-left space-y-3 mb-6">
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">5 competitors per analysis</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Report history</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Basic signal sources</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Export to PDF</span>
                    </li>
                  </ul>
                  
                  <Button 
                    className="w-full" 
                    onClick={() => window.location.href = '/api/login'}
                    data-testid="button-start-free"
                  >
                    Start Free
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary">
              <CardContent className="p-6">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <h3 className="text-2xl font-bold text-foreground">Premium</h3>
                    <Badge>Coming Soon</Badge>
                  </div>
                  <p className="text-3xl font-bold text-primary mb-4">$29<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                  
                  <ul className="text-left space-y-3 mb-6">
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Unlimited competitors</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Scheduled reports</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Advanced data sources</span>
                    </li>
                    <li className="flex items-center">
                      <Shield className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-foreground">Trend tracking</span>
                    </li>
                  </ul>
                  
                  <Button variant="outline" className="w-full" disabled data-testid="button-premium">
                    Coming Soon
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
