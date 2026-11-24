## american-routes-routing

There's a radio show called American Routes (https://www.amroutes.org/) that I really love. It's all sorts of Americana music, with a focus on the Louisiana region that it comes from. Only problem is it's on Sunday nights here at like 11:00 so I often miss it. They don't surface it as a podcast, but their website is an archive of all their shows going way back. 

I made this repo as a way to turn that web archive into a podcast RSS feed. It's not necessary to run this yourself - I run it and update the rss feed periodically - just use the following URL as your podcast source:

[#podcast-rss-url#](https://chippenzie.github.io/american-routes-routing/amroutes.rss)

I update the RSS, but I don't do it that often, but there's tons of content to tide you over while you wait.

The rest of this is mainly for me:
## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000/api](http://localhost:3000/api) to regenerate the feed.
