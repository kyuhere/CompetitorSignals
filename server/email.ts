import { Resend } from 'resend';
import { openaiWebSearch } from './services/openaiWebSearch';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailReportParams {
  to: string;
  reportTitle: string;
  reportContent: string;
  competitors: string[];
}

export async function sendCompetitorReport({
  to,
  reportTitle,
  reportContent,
  competitors,
}: EmailReportParams) {
  // Fetch latest news via OpenAI web_search for the competitors
  let latestNews: Array<{ title: string; url: string; publishedAt?: string; domain: string }> = [];
  try {
    const per = await Promise.allSettled(
      (competitors || []).map(c => openaiWebSearch.searchNewsForCompetitor(String(c), 'general'))
    );
    const all = per.flatMap(r => r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const seen = new Set<string>();
    for (const it of all) {
      const url = (it as any)?.url || '';
      const title = (it as any)?.title || '';
      if (!url || !title) continue;
      try {
        const key = `${new URL(url).href}|${title.trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const publishedAt = (it as any)?.publishedAt;
        if (publishedAt) {
          const d = new Date(publishedAt);
          if (!isNaN(d.getTime()) && d < thirtyDaysAgo) continue;
        }
        const domain = new URL(url).hostname.replace(/^www\./, '');
        latestNews.push({ title, url, publishedAt, domain });
      } catch {}
    }
    latestNews.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    latestNews = latestNews.slice(0, 10);
  } catch (e) {
    console.warn('[email] failed to fetch latest news for email:', e);
  }

  // Generate HTML email content
  const htmlContent = generateReportEmailHTML(reportTitle, reportContent, competitors, latestNews);

  try {
    console.log(`Attempting to send email to: ${to}`);
    console.log(`Report title: ${reportTitle}`);
    console.log(`Competitors: ${competitors.join(', ')}`);
    console.log(`Using API key: ${process.env.RESEND_API_KEY ? 'Present' : 'Missing'}`);

    const emailPayload = {
      from: process.env.RESEND_FROM || 'Competitor Lemonade <send@builtagent.com>',
      to: [to],
      subject: `🍋 ${reportTitle} - Competitor Analysis Report`,
      html: htmlContent,
      replyTo: process.env.RESEND_REPLY_TO || undefined,
    };

    console.log('Email payload:', {
      from: emailPayload.from,
      to: emailPayload.to,
      subject: emailPayload.subject,
      htmlLength: htmlContent.length
    });

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('Resend API error:', JSON.stringify(error, null, 2));
      return { success: false, error: typeof error === 'string' ? error : JSON.stringify(error) };
    }

    console.log('Email sent successfully:', data);
    return { success: true, id: data?.id };
  } catch (error: any) {
    console.error('Failed to send email - Full error:', error);
    console.error('Error details:', {
      message: error?.message,
      status: error?.status,
      statusCode: error?.statusCode,
      code: error?.code,
      name: error?.name,
      stack: error?.stack
    });
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

function generateReportEmailHTML(title: string, reportContent: any, competitors: string[], latestNews: Array<{ title: string; url: string; publishedAt?: string; domain: string }> = []): string {
  const competitorsList = competitors.join(', ');

  // Parse report content if it's a string
  let parsedContent = reportContent;
  if (typeof reportContent === 'string') {
    try {
      parsedContent = JSON.parse(reportContent);
    } catch (e) {
      // Fallback for plain text/Markdown content
      // Use snake_case key that the template checks (executive_summary)
      parsedContent = { executive_summary: reportContent } as any;
    }
  }

  // Detect Newsletter Markdown (from summarizeNewsletterDigest)
  const originalString = typeof reportContent === 'string' ? reportContent : '';
  const isNewsletter = /\*\*Executive Summary\*\*/.test(originalString);

  const mdBold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const mdLinks = (s: string) => s.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const mdAuto = (s: string) => s.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const mdInline = (s: string) => mdAuto(mdLinks(mdBold(s)));
  const extractMarkdownLinks = (s: string) => {
    const links: { text: string; url: string }[] = [];
    if (!s) return links;
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(s)) !== null) {
      links.push({ text: m[1], url: m[2] });
    }
    return links;
  };

  function renderNewsletterMarkdown(md: string): string {
    const lines = md.split(/\r?\n/);
    const out: string[] = [];
    let listOpen = false;

    const flushList = () => {
      if (listOpen) {
        out.push('</ul>');
        listOpen = false;
      }
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flushList(); continue; }

      // Headings like **Executive Summary**
      if (/^\*\*.*\*\*$/.test(line)) {
        flushList();
        out.push(`<h2 style="font-size:22px;font-weight:700;margin:20px 0 12px 0;border-bottom:2px solid #FFE606;padding-bottom:6px;">${mdInline(line.replace(/^\*\*(.*)\*\*$/, '$1'))}</h2>`);
        continue;
      }

      // Bullets like - **Company**: update text
      if (/^-\s+/.test(line)) {
        if (!listOpen) { out.push('<ul style="padding-left:20px;margin:0 0 14px 0;">'); listOpen = true; }
        const li = mdInline(line.replace(/^-\s+/, ''));
        out.push(`<li style="margin:8px 0;">${li}</li>`);
        continue;
      }

      // Paragraph
      flushList();
      out.push(`<p style="margin:10px 0;">${mdInline(line)}</p>`);
    }
    flushList();
    // Wrap in a styled section
    return `<div class="section">${out.join('')}</div>`;
  }

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
          background: linear-gradient(135deg, #FFE606, #FFD600);
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
          border-left: 3px solid #FFE606;
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

          ${isNewsletter ? renderNewsletterMarkdown(originalString) : ''}

          ${!isNewsletter && parsedContent.key_takeaways && parsedContent.key_takeaways.length > 0 ? `
          <div class="section">
            <h2>🔥 3 Key Takeaways</h2>
            <p style="margin-bottom: 15px; font-style: italic;">The most important insights from your competitor analysis:</p>
            <ul class="insights-list">
              ${parsedContent.key_takeaways.slice(0, 3).map((takeaway: string) => `<li>${mdInline(takeaway)}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          ${!isNewsletter && parsedContent.executive_summary ? `
          <div class="section">
            <h2>🎯 Executive Summary</h2>
            <p>${mdInline(parsedContent.executive_summary)}</p>
          </div>
          ` : ''}

          ${!isNewsletter && parsedContent.strategic_insights && parsedContent.strategic_insights.length > 0 ? `
          <div class="section">
            <h2>🚀 Strategic Insights</h2>
            <ul class="insights-list">
              ${parsedContent.strategic_insights.map((insight: string) => `<li>${mdInline(insight)}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          ${!isNewsletter && parsedContent.competitors && parsedContent.competitors.length > 0 ? `
          <div class="section">
            <h2>🏢 Competitor Analysis</h2>
            ${parsedContent.competitors.map((competitor: any) => `
              <h3>${competitor.competitor}</h3>
              <p><strong>Activity Level:</strong> ${competitor.activity_level}</p>
              ${competitor.recent_developments && competitor.recent_developments.length > 0 ? `
                <h4>Recent Developments:</h4>
                <ul class="insights-list">
                  ${competitor.recent_developments.map((dev: string) => `<li>${mdInline(dev)}</li>`).join('')}
                </ul>
              ` : ''}
            `).join('')}
          </div>
          ` : ''}

          ${latestNews && latestNews.length > 0 ? `
          <div class="section">
            <h2>📰 Latest News</h2>
            <ul class="insights-list">
              ${latestNews.map(n => `
                <li>
                  <a href="${n.url}" target="_blank" rel="noopener noreferrer">${n.domain}</a>
                  ${n.title ? ` — ${n.title}` : ''}
                  ${n.publishedAt ? ` <span style="color:#666;font-size:12px;">(${new Date(n.publishedAt).toLocaleDateString()})</span>` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
          ` : ''}

          <div class="section" style="text-align: center;">
            <h2>Want More Insights?</h2>
            <p>Get <span class="highlight">10 competitor reports</span> bi-weekly with full AI analysis and email delivery.</p>
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