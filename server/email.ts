import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailReportParams {
  to: string;
  reportTitle: string;
  reportContent: any;
  competitors: string[];
}

export async function sendCompetitorReport({
  to,
  reportTitle,
  reportContent,
  competitors
}: EmailReportParams) {
  // Generate HTML email content
  const htmlContent = generateReportEmailHTML(reportTitle, reportContent, competitors);
  
  try {
    console.log(`Attempting to send email to: ${to}`);
    console.log(`Using API key: ${process.env.RESEND_API_KEY ? 'Present' : 'Missing'}`);
    
    const result = await resend.emails.send({
      from: 'Competitor Lemonade <onboarding@resend.dev>',
      to: to,
      subject: `🍋 ${reportTitle} - Competitor Analysis Report`,
      html: htmlContent,
    });
    
    console.log('Email sent successfully:', result);
    return { success: true, id: result.data?.id };
  } catch (error: any) {
    console.error('Failed to send email - Full error:', error);
    console.error('Error details:', {
      message: error?.message,
      status: error?.status,
      name: error?.name
    });
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

function generateReportEmailHTML(title: string, reportContent: any, competitors: string[]): string {
  const competitorsList = competitors.join(', ');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          line-height: 1.6;
          color: #000000;
          background-color: #ffffff;
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(230, 230, 230, 0.3);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #FFE606, #20C997);
          padding: 40px 30px;
          text-align: center;
          color: #000000;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .content {
          padding: 30px;
        }
        .section {
          margin-bottom: 30px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.7);
          border-radius: 12px;
          border: 1px solid rgba(230, 230, 230, 0.3);
        }
        .section h2 {
          color: #000000;
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 15px;
          border-bottom: 2px solid #FFE606;
          padding-bottom: 10px;
        }
        .section h3 {
          color: #000000;
          font-size: 16px;
          font-weight: 500;
          margin: 20px 0 10px 0;
        }
        .competitors-list {
          background: #F9FAFB;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #FFE606;
          margin: 15px 0;
        }
        .insights-list {
          padding-left: 0;
          list-style: none;
        }
        .insights-list li {
          background: rgba(255, 230, 6, 0.1);
          margin: 10px 0;
          padding: 12px 15px;
          border-radius: 8px;
          border-left: 3px solid #20C997;
        }
        .footer {
          background: #F9FAFB;
          padding: 20px 30px;
          text-align: center;
          border-top: 1px solid rgba(230, 230, 230, 0.3);
          font-size: 14px;
          color: #737373;
        }
        .cta-button {
          display: inline-block;
          background: #FFE606;
          color: #000000;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 600;
          margin: 20px 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .highlight {
          background: #FFE606;
          color: #000000;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🍋 Competitor Lemonade Report</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your rivals, freshly pressed</p>
        </div>
        
        <div class="content">
          <div class="section">
            <h2>📊 Analysis Overview</h2>
            <p><strong>Report:</strong> ${title}</p>
            <div class="competitors-list">
              <strong>Competitors Analyzed:</strong> ${competitorsList}
            </div>
            <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</p>
          </div>

          ${reportContent.executiveSummary ? `
          <div class="section">
            <h2>🎯 Executive Summary</h2>
            <p>${reportContent.executiveSummary}</p>
          </div>
          ` : ''}

          ${reportContent.keyInsights && reportContent.keyInsights.length > 0 ? `
          <div class="section">
            <h2>💡 Key Insights</h2>
            <ul class="insights-list">
              ${reportContent.keyInsights.map((insight: string) => `<li>${insight}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          ${reportContent.competitorAnalysis ? `
          <div class="section">
            <h2>🏢 Competitor Analysis</h2>
            ${Object.entries(reportContent.competitorAnalysis).map(([company, analysis]: [string, any]) => `
              <h3>${company}</h3>
              <p>${analysis.summary || analysis}</p>
            `).join('')}
          </div>
          ` : ''}

          ${reportContent.strategicRecommendations && reportContent.strategicRecommendations.length > 0 ? `
          <div class="section">
            <h2>🚀 Strategic Recommendations</h2>
            <ul class="insights-list">
              ${reportContent.strategicRecommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          <div class="section" style="text-align: center;">
            <h2>Want More Insights?</h2>
            <p>Get <span class="highlight">5 competitor reports every two weeks</span> with full AI analysis and email delivery.</p>
            <a href="https://your-domain.replit.app" class="cta-button">
              Access Your Dashboard 🍋
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>This report was generated by <strong>Competitor Lemonade</strong> - Your AI-powered competitive intelligence platform.</p>
          <p>🍋 We squeeze competitor moves into growth opportunities.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}