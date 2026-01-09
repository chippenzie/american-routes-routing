import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-slate-200">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex space-x-8">
            <Link
              href="/"
              className="text-slate-700 hover:text-slate-900 font-medium transition-colors"
            >
              Home
            </Link>
            <Link
              href="/podroutes"
              className="text-slate-700 hover:text-slate-900 font-medium transition-colors"
            >
              Podroutes
            </Link>
            <Link
              href="/api/feed"
              className="text-slate-700 hover:text-slate-900 font-medium transition-colors"
            >
              RSS Feed
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
