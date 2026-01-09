import * as cheerio from 'cheerio';

type MP3Link = {
  url: string;
  title: string;
};

type EpisodeLink = {
  href: string;
  text: string;
  title: string;
  mp3s: MP3Link[];
  thumbnail: string | null;
};

type MonthLink = {
  month: string;
  href: string;
  episodes: EpisodeLink[];
};

type YearWithMonths = {
  year: string;
  yearHref: string;
  months: MonthLink[];
};

const VALID_MONTHS = ["DEC", "NOV", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT"];

async function fetchMP3sForEpisode(episodeHref: string): Promise<{ title: string; mp3s: MP3Link[]; thumbnail: string | null }> {
  try {
    const response = await fetch(episodeHref, {
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${episodeHref}: ${response.status}`);
      return { title: '', mp3s: [], thumbnail: null };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract the h1 title
    const title = $('h1').first().text().trim();

    const mp3s: MP3Link[] = [];
    $('div.sqs-audio-embed').each((_, element) => {
      const href = $(element).attr('data-url') || '';
      const dataTitle = $(element).attr('data-title') || '';

      // Check if the link ends with .mp3 and has the correct data-title
      if (href.endsWith('.mp3') && (dataTitle.toLowerCase().indexOf('hour') !== -1)) {
        mp3s.push({ url: href, title: dataTitle });
      }
    });

    // Extract the first thumbnail image whose class contains "thumb-image"
    let thumbnail: string | null = null;

    if ($('img.thumb-image').length > 0) {
      const thumber = $('img.thumb-image')[0]
      thumbnail = $(thumber).attr('data-src')!;
    }

    return { title, mp3s, thumbnail };
  } catch (error) {
    console.error(`Error fetching MP3s for ${episodeHref}:`, error);
    return { title: '', mp3s: [], thumbnail: null };
  }
}

async function fetchEpisodesForMonth(monthHref: string): Promise<EpisodeLink[]> {
  try {
    const response = await fetch(monthHref, {
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${monthHref}: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const episodeLinks: Array<{ href: string; text: string }> = [];
    $('a').each((_, element) => {
      const text = $(element).text().trim();
      let href = $(element).attr('href') || '';

      // Check if the link text is "Read More"
      if (text === 'Read More') {
        // Convert relative URLs to absolute URLs
        if (href && !href.startsWith('http')) {
          href = `https://www.amroutes.org${href.startsWith('/') ? '' : '/'}${href}`;
        }

        episodeLinks.push({ href, text });
      }
    });

    // Fetch MP3s and title for each episode
    const episodes: EpisodeLink[] = await Promise.all(
      episodeLinks.map(async (episodeLink) => {
        const { title, mp3s, thumbnail } = await fetchMP3sForEpisode(episodeLink.href);
        return {
          href: episodeLink.href,
          text: episodeLink.text,
          title,
          mp3s,
          thumbnail
        };
      })
    );

    // Sort episodes in reverse chronological order (newest first)
    // Extract numeric ID from URL and sort by it in descending order
    episodes.sort((a, b) => {
      const getNumericId = (href: string) => {
        const match = href.match(/\/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      };
      return getNumericId(b.href) - getNumericId(a.href);
    });

    return episodes;
  } catch (error) {
    console.error(`Error fetching episodes for ${monthHref}:`, error);
    return [];
  }
}

async function fetchMonthsForYear(yearHref: string): Promise<MonthLink[]> {
  try {
    const response = await fetch(yearHref, {
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${yearHref}: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const monthLinks: Array<{ month: string; href: string }> = [];
    $('a').each((_, element) => {
      const text = $(element).text().trim();
      let href = $(element).attr('href') || '';

      // Check if the link text is a valid month
      if (VALID_MONTHS.includes(text)) {
        // Convert relative URLs to absolute URLs
        if (href && !href.startsWith('http')) {
          href = `https://www.amroutes.org${href.startsWith('/') ? '' : '/'}${href}`;
        }

        monthLinks.push({ month: text, href });
      }
    });

    // Fetch episodes for each month
    const months: MonthLink[] = await Promise.all(
      monthLinks.map(async (monthLink) => {
        const episodes = await fetchEpisodesForMonth(monthLink.href);
        return {
          month: monthLink.month,
          href: monthLink.href,
          episodes
        };
      })
    );

    // Sort months in reverse chronological order (December first, then November, etc.)
    const monthOrder = ["DEC", "NOV", "OCT", "SEP", "AUG", "JUL", "JUN", "MAY", "APR", "MAR", "FEB", "JAN"];
    months.sort((a, b) => {
      return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
    });

    return months;
  } catch (error) {
    console.error(`Error fetching months for ${yearHref}:`, error);
    return [];
  }
}

async function fetchPodroutes(): Promise<YearWithMonths[]> {
  try {
    const response = await fetch('https://www.amroutes.org/', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find the div with data-folder="/archive-1" and get all <a> elements inside it
    const links: Array<{ href: string; text: string }> = [];
    $('div[data-folder="/archive-1"] a').each((_, element) => {
      let href = $(element).attr('href') || '';
      const text = $(element).text().trim();

      // Convert relative URLs to absolute URLs
      if (href && !href.startsWith('http')) {
        href = `https://www.amroutes.org${href.startsWith('/') ? '' : '/'}${href}`;
      }

      links.push({ href, text });
    });

    // Filter out "Back" links and links with years less than 2024
    const filteredLinks = links.filter(link => {
      // Remove if text is "Back"
      if (link.text === 'Back') {
        return false;
      }

      // Check for 4-digit numbers (years) in the text
      const yearMatches = link.text.match(/\b\d{4}\b/g);
      if (yearMatches) {
        // Remove if any year is less than 2024
        for (const yearStr of yearMatches) {
          const year = parseInt(yearStr, 10);
          if (year < 2024) {
            return false;
          }
        }
      }

      return true;
    });

    // Fetch months for each year
    const yearsWithMonths: YearWithMonths[] = await Promise.all(
      filteredLinks.map(async (link) => {
        const months = await fetchMonthsForYear(link.href);
        return {
          year: link.text,
          yearHref: link.href,
          months
        };
      })
    );

    // Sort years in reverse chronological order (newest first)
    yearsWithMonths.sort((a, b) => {
      const yearA = parseInt(a.year.match(/\d{4}/)?.[0] || '0', 10);
      const yearB = parseInt(b.year.match(/\d{4}/)?.[0] || '0', 10);
      return yearB - yearA;
    });

    return yearsWithMonths;
  } catch (error) {
    console.error('Error fetching podroutes:', error);
    return [];
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const years = await fetchPodroutes();

  // Flatten all episodes from all months and years
  const allEpisodes: Array<EpisodeLink & { year: string; month: string }> = [];
  for (const year of years) {
    for (const month of year.months) {
      for (const episode of month.episodes.filter(ep => ep.mp3s.length > 0)) {
        allEpisodes.push({
          ...episode,
          year: year.year,
          month: month.month
        });
      }
    }
  }

  const buildDate = new Date().toUTCString();
  const channelImage = 'https://s3.amazonaws.com/production.mediajoint.prx.org/public/series_images/23980/ARlogo_redblue_medium.PNG';

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>American Routes</title>
    <link>https://www.amroutes.org</link>
    <description>American Routes is a weekly two-hour public radio program produced in New Orleans, presenting the breadth and depth of the American musical and cultural landscape.</description>
    <language>en-us</language>
    <copyright>American Routes</copyright>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <pubDate>${buildDate}</pubDate>
    <generator>amroutes rss generator</generator>

    <itunes:author>American Routes</itunes:author>
    <itunes:summary>American Routes is a weekly two-hour public radio program produced in New Orleans, presenting the breadth and depth of the American musical and cultural landscape.</itunes:summary>
    <itunes:owner>
      <itunes:name>American Routes</itunes:name>
      <itunes:email>info@americanroutes.org</itunes:email>
    </itunes:owner>
    <itunes:explicit>no</itunes:explicit>
    <itunes:category text="Music">
      <itunes:category text="Music History"/>
    </itunes:category>
    <itunes:image href="${channelImage}"/>

    <image>
      <url>${channelImage}</url>
      <title>American Routes</title>
      <link>https://www.amroutes.org</link>
    </image>

    <atom:link href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/feed" rel="self" type="application/rss+xml"/>
${allEpisodes.flatMap(episode => {
  const thumbnail = episode.thumbnail || channelImage;

  // Create a separate item for each MP3
  return episode.mp3s.map((mp3, index) => {
    const hourSuffix = index === 0 ? ' - Hour One' : ' - Hour Two';
    const itemTitle = episode.title + hourSuffix;
    const itemGuid = `${episode.href}#hour-${index + 1}`;

    return `
    <item>
      <title>${escapeXml(itemTitle)}</title>
      <link>${escapeXml(episode.href)}</link>
      <description>${escapeXml(itemTitle)}</description>
      <guid isPermaLink="false">${escapeXml(itemGuid)}</guid>
      <pubDate>${buildDate}</pubDate>

      <enclosure url="${escapeXml(mp3.url)}" type="audio/mpeg"/>

      <itunes:title>${escapeXml(itemTitle)}</itunes:title>
      <itunes:summary>${escapeXml(itemTitle)}</itunes:summary>
      <itunes:image href="${escapeXml(thumbnail)}"/>
      <itunes:duration>7200</itunes:duration>
    </item>`;
  });
}).join('')}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
