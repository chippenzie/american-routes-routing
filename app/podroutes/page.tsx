import * as cheerio from 'cheerio';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'amroutes rss generator',
};

type MP3Link = {
  url: string;
  title: string;
};

type EpisodeLink = {
  href: string;
  text: string;
  title: string;
  mp3s: MP3Link[];
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

const VALID_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

async function fetchMP3sForEpisode(episodeHref: string): Promise<{ title: string; mp3s: MP3Link[] }> {
  try {
    const response = await fetch(episodeHref, {
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${episodeHref}: ${response.status}`);
      return { title: '', mp3s: [] };
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

    return { title, mp3s };
  } catch (error) {
    console.error(`Error fetching MP3s for ${episodeHref}:`, error);
    return { title: '', mp3s: [] };
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
        const { title, mp3s } = await fetchMP3sForEpisode(episodeLink.href);
        return {
          href: episodeLink.href,
          text: episodeLink.text,
          title,
          mp3s
        };
      })
    );

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

export default async function Podroutes() {
  const years = await fetchPodroutes();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">
          amroutes rss generator
        </h1>

        {years.length === 0 ? (
          <p className="text-slate-600">No links found in archive-1</p>
        ) : (
          <div className="space-y-6">
            {years.map((year, yearIndex) => (
              <div key={yearIndex} className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-semibold text-slate-800 mb-4">
                  <a
                    href={year.yearHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {year.year}
                  </a>
                </h2>

                {year.months.length === 0 ? (
                  <p className="text-slate-500 text-sm">No months found</p>
                ) : (
                  <div className="space-y-4">
                    {year.months.map((month, monthIndex) => (
                      <div key={monthIndex} className="border-l-4 border-slate-300 pl-4">
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">
                          <a
                            href={month.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 transition-colors"
                          >
                            {month.month}
                          </a>
                        </h3>

                        {month.episodes.filter(episode => episode.mp3s.length > 0).length === 0 ? (
                          <p className="text-slate-400 text-sm">No episodes found</p>
                        ) : (
                          <div className="space-y-3">
                            {month.episodes.filter(episode => episode.mp3s.length > 0).map((episode, episodeIndex) => (
                              <div key={episodeIndex} className="episode bg-slate-50 p-3 rounded">
                                <a
                                  href={episode.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium"
                                >
                                  {episode.title || `Episode ${episodeIndex + 1}`}
                                </a>

                                <ul className="mt-2 space-y-1 ml-4">
                                  {episode.mp3s.map((mp3, mp3Index) => (
                                    <li key={mp3Index}>
                                      <a
                                        href={mp3.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-green-600 hover:text-green-800 hover:underline text-sm flex items-center gap-1"
                                      >
                                        <span className="text-xs">🎵</span>
                                        {mp3.title}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
