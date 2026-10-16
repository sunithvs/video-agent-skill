<!-- Researched 2026-10-12 from the providers' own pages; endpoints marked [LIVE] were called that day. Re-check terms before relying on a provider for a new kind of use. stock.py implements the recommended sources. -->
# Stock video, music and SFX APIs for monetized YouTube: research for a CLI fetcher

Researched 2026-10-12. Terms come from each provider's own docs, license pages and help pages. Blog listicles were not used for terms.
Status tags used below:
- **[LIVE]**: I called the keyless endpoint with curl today and checked the response shape.
- **[DOCS]**: the request comes from the official docs. It needs a key, so I did not call it with real credentials; I only checked that it returns 401/400 without one.
- **[UNVERIFIED]**: anything I could not confirm on a first-party page.

No accounts were created and no credentials were entered.

---

## 0. TL;DR

| Provider | Video | Music | SFX | Auth | Commercial / monetized YT | Attribution | Content ID risk |
|---|---|---|---|---|---|---|---|
| **Pexels** | yes (4K, portrait) | - | - | free key, `Authorization: KEY` | yes | not required (API: link to Pexels) | low |
| **Pixabay** | yes (4K) | site only, not in API | site only | free key, `?key=` | yes | not required (API: show source) | video low; **music: some tracks are registered in Content ID** |
| **Coverr** | yes (max 2048x1152 in example) | yes (`/audios`, small) | - | free account key, `Bearer` / `?api_key=`; demo 50 req/h | yes | not required (API: clickable logo) | low |
| **Openverse** | no | yes (Jamendo, Wikimedia, Freesound) | yes (Freesound) | **none** (optional registration) | per item; filter to cc0/pdm/by | per CC license (`attribution` string returned) | low-moderate (CC BY artists may register elsewhere) |
| **Wikimedia Commons** | yes | yes | yes | **none** (User-Agent required) | per item (extmetadata) | per item | low |
| **NASA Image & Video Library** | yes | yes (mostly speech) | - | **none** | yes (no endorsement, no logos) | "NASA" as source | low, but check third-party credits |
| **Internet Archive** | yes (PD films, Prelinger) | yes | some | **none** | per item `licenseurl` | per item | moderate (PD footage sometimes falsely claimed) |
| **Freesound** | - | some | **yes (~592k)** | free key `Authorization: Token KEY`; OAuth2 for originals | CC0 / CC BY yes; BY-NC no | CC BY: required | low-moderate (raw SFX reused inside registered songs) |
| **Jamendo API** | - | yes (~645k tracks via Openverse count) | - | free `client_id` | CC BY/BY-SA tracks yes; **API itself free only for non-commercial apps** | required for CC BY | low for CC BY (Jamendo only registers ARR / BY-NC-ND tracks) |
| **ccMixter** | - | yes | - | **none** | `lic=by` / `lic=zero` yes | required for BY | low-moderate |
| **Incompetech (Kevin MacLeod)** | - | yes (1,443 tracks) | - | **none** (site's catalog JSON, not an official API) | **yes, monetization explicitly allowed** | **required, in the description** | **pre-registered in Content ID; claims are released when the credit is in the description** |
| **YouTube Audio Library** | - | yes | yes | **no API** | yes (YPP) | some tracks (CC BY) | **none: YouTube says it won't be claimed** |
| **Mixkit** | yes | yes | yes | **no API** | yes (Free licenses); **Restricted video license forbids monetized YT** | not required | low (claims go to team@mixkit.co) |
| **Videvo** | now part of Freepik/Magnific | | | paid API (`x-magnific-api-key`) | plan-dependent | | |
| **Free Music Archive** | - | yes | - | **no API** (old `/api/get/` returns 404) | per CC license | per license | per track |
| **Uppbeat** | - | yes | yes | **no public API found** | free tier needs a per-video "Uppbeat Credit" | credit code | handled by credit / safelist |
| **Epidemic Sound** | - | 55k tracks | 250k SFX | partner API key / OAuth; free plan is prototyping only; **MCP server for subscribers** | paid subscription | no | cleared for subscribers |
| **Storyblocks** | yes | yes | yes | HMAC keys; free *test* keys for internal testing only; full keys via sales | enterprise agreement | no | has a YouTube whitelist API |
| **Shutterstock** | yes | yes | yes | OAuth / basic; free app shows limited library | paid subscription per media type | no | - |
| **Artlist** | (footage not in API) | yes | - | enterprise-only Music API | enterprise | no | - |

---

## 1. Recommendations

### Stock video (b-roll)
1. **Pexels** is the default. It needs a free key. It has the best general-purpose quality, 4K, and native `orientation=portrait` for Reels/Shorts. No attribution is required. Limits are 200 req/h and 20k/month.
2. **Pixabay** is second. It needs a free key. It returns `large` (usually 3840x2160), `medium`, `small` and `tiny` renditions, up to `per_page=200`, and allows 100 req/min. You must cache results for 24h and download files rather than hotlink them.
3. **Coverr** is optional and needs a free key. Its curated footage looks less like stock. The demo key is limited to 50 req/h, and you must PATCH a download ping for every file.
4. **Keyless fallbacks** for niche or historical content: **Wikimedia Commons** (filter to CC0/PD/CC BY through `extmetadata`), **NASA** (space, launches, Earth), **Internet Archive** (Prelinger and public-domain films, filtered on `licenseurl`).

### Music for monetized YouTube (lowest Content ID risk first)
1. **YouTube Audio Library** is the safest. YouTube states that its tracks "won't be claimed". It has no API, so the tool should prompt the user to drop an MP3 from Studio > Audio library into a folder (see section 4).
2. **Openverse to Jamendo / ccMixter / Wikimedia, filtered to `cc0,pdm,by`** works keyless. Jamendo only submits tracks to Content ID if they are All-Rights-Reserved or CC BY-NC-ND, so CC BY tracks are not registered by Jamendo. Artists can still register through other distributors, so keep the license record.
3. **Incompetech** works keyless. It has 1,443 tracks under CC BY 4.0 and explicitly says "Yes, AND you can monetize the videos." Its tracks are **pre-registered in Content ID**, and claims are released when the credit sits in the video description, so the tool **must write the exact credit line into the description file**.
4. If the user subscribes: **Epidemic Sound** offers an official MCP server and API key for subscribers, with claims cleared for the subscriber's channel. **Storyblocks** has a YouTube whitelist endpoint but is enterprise-only.
5. **Avoid automating Pixabay music.** It has no documented API, and some tracks are fingerprinted in Content ID (the "shield" icon). Use it manually and keep the license certificate.

**License allowlist for music and video synced into a video:** use `cc0`, `pdm` and `by` only.
- **Exclude `nd`.** CC 4.0 says syncing music "in timed relation with a moving image" *always* creates Adapted Material, which ND forbids.
- **Exclude `nc`**, because the video is monetized.
- **Exclude `sa` by default.** BY-SA would require your whole video to be released under BY-SA. Offer it only as an opt-in flag.

### Sound effects
1. **Freesound** is best. Use the free key and filter `license:"Creative Commons 0"`. The `preview-hq-mp3` (~128 kbps) works with a token key. Originals (WAV) need OAuth2.
2. **Keyless route:** Openverse with `source=freesound&license=cc0` returns direct `cdn.freesound.org` HQ-MP3 preview URLs. **Do not use `category=sound_effect`**: Freesound items have `category: null` in Openverse, so that filter returns 0 results (verified).
3. **Offline library to bundle or recommend:** the Sonniss GDC bundle (7.47 GB, royalty-free, commercial, no attribution, manual or torrent download), Mixkit SFX (manual), and YouTube Audio Library SFX (manual).

### Works out of the box (no key) vs needs a free key
- **No key:** Openverse (audio and images), Wikimedia Commons, NASA Image & Video Library, Internet Archive, ccMixter, Incompetech catalog JSON.
- **Free key (user signs up):** Pexels, Pixabay, Freesound, Jamendo (`client_id`), Coverr. Openverse registration is optional and gives higher limits.
- **Paid / partner only:** Epidemic Sound, Storyblocks, Shutterstock, Artlist, Freepik/Magnific (ex-Videvo).
- **No API at all:** YouTube Audio Library, Mixkit, Uppbeat (none found), Free Music Archive, Pixabay music/SFX (undocumented).

---

## 2. Provider details

### 2.1 Pexels (videos)
1. **Offers:** photos and videos. Catalog size is not stated in the API docs.
2. **Auth:** free key. Sign up and request it at https://www.pexels.com/api/ ("Get Started"). Send it in the header `Authorization: YOUR_API_KEY`, with **no "Bearer"**.
3. **Endpoints** (base `https://api.pexels.com`). Video endpoints moved to `/v1/videos/...`; the docs say "The https://api.pexels.com/videos/ endpoints will be deprecated in the future."
   - `GET /v1/videos/search`: `query` (required), `orientation` = `landscape|portrait|square`, `size` = `large` (4K) | `medium` (Full HD) | `small` (HD) as a *minimum* size, `locale`, `page`, `per_page` (default 15, max 80).
   - `GET /v1/videos/popular`: `min_width`, `min_height`, `min_duration`, `max_duration` (seconds), `page`, `per_page`.
   - **Search has no duration filter.** Filter client-side on `duration`.
   - **Response:** `page`, `per_page`, `total_results`, `next_page`, `videos[]`. Each video has:
     - `id`, `width`, `height`, `duration` (seconds), `url` (Pexels page, use it for attribution), `image` (poster)
     - `user{id,name,url}`
     - `video_files[]{id, quality ("hd"|"sd" in the docs; "uhd" also appears in practice [UNVERIFIED]), file_type ("video/mp4"), width, height, fps, link}`
     - `video_pictures[]`
     - Choose the rendition by `width`/`height`, not by `quality`.
4. **Rate limits:** 200 req/hour and 20,000 req/month by default. Headers are `X-Ratelimit-Limit`, `-Remaining` and `-Reset`; on 429 those headers are absent. Higher limits are free on request.
5. **License (https://www.pexels.com/license/):**
   - Free to use, attribution not required, modification allowed.
   - Not allowed: identifiable people shown "in a bad light or in a way that is offensive"; selling unaltered copies; implying endorsement; redistributing on other stock or wallpaper platforms; use in a trademark or business name.
   - API guidelines: "show a prominent link to Pexels", and credit "when possible", e.g. "Photo by John Doe on Pexels" with a link (use "Video by ...").
   - Content ID: Pexels does not register content. Visual Content ID claims are rare; keep the page URL as proof.
6. **Example [DOCS]:**
   ```bash
   curl -H "Authorization: $PEXELS_API_KEY" \
     "https://api.pexels.com/v1/videos/search?query=nature&per_page=1"
   # Reels: add &orientation=portrait&size=medium
   ```

### 2.2 Pixabay (videos; music not in API)
1. **Offers:** images and videos through the API. Music and SFX exist on the website only.
   - The docs cover only `/api/` (images) and `/api/videos/`.
   - An undocumented `/api/audio/` route answers with the key error instead of 404 (verified: `/api/music/` returns 404), so something exists. It is **not public or documented, so don't rely on it.**
2. **Auth:** free key as the query parameter `key=`. Register at pixabay.com; the key is shown on https://pixabay.com/api/docs/ when you are logged in.
3. **Endpoint:** `GET https://pixabay.com/api/videos/`
   - `q` (URL-encoded, max 100 chars), `lang`, `id`, `video_type` = `all|film|animation`, `category`, `min_width`, `min_height`, `editors_choice`, `safesearch`, `order` = `popular|latest`, `page`, `per_page` (3-200, default 20).
   - **Response:** `total`, `totalHits`, `hits[]`. Each hit has:
     - `id`, `pageURL`, `type`, `tags`, `duration` (s), `user`, `user_id`, `userImageURL`
     - `videos.{large,medium,small,tiny}.{url,width,height,size,thumbnail}`
     - `large` is usually 3840x2160; if it is missing, `url` is empty and `size` is 0.
4. **Rate limits:** 100 requests per 60 s per key. Headers are `X-RateLimit-Limit/Remaining/Reset`; the error is 429 "API rate limit exceeded".
   - "Requests must be cached for 24 hours."
   - No systematic mass downloads.
   - No permanent hotlinking: download files to your own storage.
5. **License (Pixabay Content License):**
   - Free use, no attribution, modification allowed.
   - Prohibited: selling or distributing on a "standalone basis" (no creative effort); commercial use of content showing recognisable trademarks or brands; "immoral or illegal" use; misleading use; use as a trademark.
   - API: show users where the content comes from when you display search results.
   - **Content ID (music):** Pixabay acknowledges that some contributors register their tracks in Content ID. Those tracks carry a shield icon and offer a *Download certificate* to use in a YouTube dispute. Pixabay's FAQ describes the dispute flow. Video claims are rare.
6. **Example [DOCS]:**
   `curl "https://pixabay.com/api/videos/?key=$PIXABAY_KEY&q=yellow+flowers&per_page=20"`

### 2.3 Coverr (videos plus some music)
1. **Offers:** free stock video (HD/4K), a royalty-free music endpoint (`/audios`; the docs example shows `total: 230`), plus collections, categories and scenes. It also has an MCP server.
2. **Auth:** create a Coverr account, then add an app at https://coverr.co/developers to get a key instantly.
   - Header `Authorization: Bearer KEY`, or the query parameter `?api_key=KEY`.
   - **Demo** status gives 50 req/h. **Production** gives 2,000 req/h and requires a Pro/Ultimate subscription.
3. **Endpoints** (base `https://api.coverr.co`):
   - `GET /videos?query=&page=0&page_size=20&sort=popular|date|trending&urls=true`
   - **Response:** `page`, `pages`, `page_size`, `total`, `hits[]`. Each hit has `id`, `title`, `description`, `tags`, `is_vertical`, `aspect_ratio` ("16:9"), `duration` (s, e.g. 11.625), `max_width`, `max_height`, `poster`, `thumbnail`, and `urls{mp4, mp4_preview (low-res), mp4_download}`.
     - URLs are signed JWT links tied to your key.
     - `urls` appear in list results only with `urls=true`.
     - There is no per-resolution choice yet ("coming soon").
   - `GET /videos/:id` always includes `urls`.
   - **Required:** `PATCH /videos/:id/stats/downloads` (204) for every download. The docs say this is "a MUST and not optional".
   - `GET /audios?query=&page&page_size&sort=date|popular` returns `hits[]{id,title,duration,genres,moods,instruments,tempo,isPremium,urls{preview,previewDownload,masterDownload}}`.
4. **Rate limits:** as above.
5. **License (https://coverr.co/license):**
   - Videos and music are free "for both commercial and non-commercial purposes"; attribution is not required.
   - Not allowed: building a competing service, AI training, using the trademarks or brands shown.
   - Model releases exist but are not provided to users.
   - The API docs add a clickable Coverr logo requirement for apps.
   - Note: the API intro says access is free "as long as you don't charge for it yourself, AKA re-sell or use the videos for commercial use". That wording targets apps re-selling access. The content license itself allows commercial use.
6. **Example [DOCS, host from the auth page]:**
   ```bash
   curl -H "Authorization: Bearer $COVERR_API_KEY" "https://api.coverr.co/videos?query=ocean&page_size=20&urls=true"
   curl -X PATCH -H "Authorization: Bearer $COVERR_API_KEY" "https://api.coverr.co/videos/<id>/stats/downloads"
   ```

### 2.4 Videvo
`videvo.net` (and `static.videvo.net/a/videvo-api-documentation`) now **301-redirects to freepik.com**. Videvo has been folded into Freepik, which rebranded its API as **Magnific** in 2026.
- **Magnific API:** header `x-magnific-api-key` on `api.magnific.com`. The legacy host `api.freepik.com` still answers 401 without a key.
- **Endpoints:** `GET /v1/videos`, `GET /v1/videos/{id}`, `GET /v1/videos/{id}/download`, plus `GET /v1/music`.
- **Downloads:** stock downloads through the API need a paid plan. Premium/Premium+/Pro are capped at 100 downloads/day; Business/Enterprise are credit-metered.
- **Verdict:** paid, so it is not a free source.

### 2.5 Mixkit (Envato)
**No API** (`mixkit.co/api/` returns 404). Licenses are per item type (https://mixkit.co/license/):
- **Stock Video Free:** commercial use and YouTube allowed; attribution not required.
- **Stock Video *Restricted*:** personal use only. It explicitly excludes "a monetized YouTube video". If anyone scrapes Mixkit, they must check which license each clip has.
- **Stock Music Free:** web, social, YouTube and ads allowed. Not allowed: CDs/DVDs, TV/radio, video games, remixing into a music-only track, registering the music in any rights-management service. "If you receive a claim, please forward the details to team@mixkit.co."
- **SFX Free:** very broad, including YouTube, film and broadcast. You cannot redistribute the files on their own.

Use: manual download only.

### 2.6 Openverse (keyless audio and images) [LIVE]
1. **Offers:** openly licensed **audio** and **images**; no video.
   - Audio sources from `/v1/audio/stats/` today: `jamendo` 644,709; `wikimedia_audio` 3,982,160; `freesound` 591,898.
   - Images: about 915M across 52 sources.
2. **Auth:** none needed. Optionally register with `POST /v1/auth_tokens/register/`, then `POST /v1/auth_tokens/token/` (client credentials), then send `Authorization: Bearer <token>` for higher limits and larger pages.
3. **Endpoints:** `GET https://api.openverse.org/v1/audio/` and `GET https://api.openverse.org/v1/images/`
   - **Shared parameters:** `q` (≤200 chars), `license` (comma list: `by, by-nc, by-nc-nd, by-nc-sa, by-nd, by-sa, cc0, nc-sampling+, pdm, sampling+`), `license_type` (`all, all-cc, commercial, modification`), `source`, `excluded_source`, `extension`, `mature`, `filter_dead`, `page`, `page_size`.
   - **Audio only:** `category` (`audiobook, music, news, podcast, pronunciation, sound_effect`) and `length` (`shortest, short, medium, long`).
   - **Images only:** `aspect_ratio` (`tall, wide, square`), `size` (`small, medium, large`), `category`.
   - **Response:** `result_count`, `page_count`, `results[]`. Each result has:
     - `id`, `title`, **`url` (direct file)**, **`foreign_landing_url`** (page for attribution), `creator`, `creator_url`
     - `license`, `license_version`, `license_url`, **`attribution`** (a ready-made credit string)
     - `source`, `provider`, `category`, `genres`, `tags`, `filetype`, `filesize`
     - **`duration` in milliseconds**
     - `alt_files` (for Freesound, a WAV `apiv2/sounds/<id>/download/` URL that needs OAuth2)
   - **Verified gotchas:**
     - Freesound items have `category: null`, so `category=sound_effect` with `q=whoosh` returned **0** while `source=freesound` returned 240. Use `source=freesound` for SFX.
     - Jamendo `url`s look like `https://prod-1.storage.jamendo.com/?trackid=…&format=mp32` and download directly (audio/mpeg, 200).
     - Freesound URLs are `cdn.freesound.org/previews/...-hq.mp3`.
4. **Rate limits (from the response headers):** anonymous `20/min` burst and `200/day` sustained.
   - Anonymous `page_size` is at most **20**. Asking for 50 returns 401 "page_size may not exceed 20 for anonymous requests".
   - Pagination depth is capped: `result_count` maxed at 240 for anonymous queries.
   - The terms forbid scraping and forbid using multiple machines to evade limits.
5. **License:** per item.
   - Openverse "does not verify its licensing status". Verify on `foreign_landing_url` and store it.
   - Apps must say they use Openverse and that Openverse doesn't endorse them.
   - For YouTube use `license=cc0,pdm,by` (see the allowlist in section 1).
6. **Examples [LIVE]:**
   ```bash
   curl "https://api.openverse.org/v1/audio/?q=upbeat&source=jamendo&license=cc0,by&category=music&page_size=20"
   curl "https://api.openverse.org/v1/audio/?q=whoosh&source=freesound&license=cc0&page_size=20"
   curl "https://api.openverse.org/v1/images/?q=sunset&license_type=commercial&aspect_ratio=tall&page_size=20"
   ```

### 2.7 Wikimedia Commons (keyless video, audio, images) [LIVE]
1. **Offers:** 100M+ media files, including video (WebM/Ogg, with server transcodes) and audio.
2. **Auth:** none.
   - A descriptive `User-Agent` with contact info is required, e.g. `mytool/0.1 (https://…; me@…)`. Generic library user agents are being throttled or blocked.
   - 2026 global limits: about 10 req/min with no identification, about 200 req/min for unauthenticated clients with a compliant User-Agent. Send requests serially and back off on 429. Media on `upload.wikimedia.org` has separate limits.
3. **Endpoint:** `GET https://commons.wikimedia.org/w/api.php`
   - **Search plus metadata in one call:**
     `action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrsearch=<terms> filetype:video&gsrlimit=20&prop=imageinfo&iiprop=url|size|mime|mediatype|extmetadata|user&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|AttributionRequired|UsageTerms`
   - **Search keywords (CirrusSearch):** `filetype:video|audio|bitmap`, `fileh:>1079`, `filew:>…`. For CC0 only, add `haswbstatement:P275=Q6938433` (structured data, so coverage is incomplete).
   - **Fields:**
     - `imageinfo[0].url` (original file), `descriptionurl` (attribution page), `width`, `height`, `duration` (s), `mime`, `size`, `user`
     - `extmetadata.LicenseShortName`, `LicenseUrl`, `Artist` (HTML), `AttributionRequired`
   - **MP4/WebM renditions:** `prop=videoinfo&viprop=derivatives` returns `derivatives[]{src,type,width,height,transcodekey}`, e.g. 240p/480p VP9 WebM, 360p MP4V.
4. **Rate limits:** see above.
5. **License:** per file. Allowlist `LicenseShortName` in {CC0, Public domain, CC BY x.x}. Build the attribution from `Artist` + `LicenseShortName` + `descriptionurl`.
6. **Example [LIVE]:**
   ```bash
   curl -A "stockfetch/0.1 (contact@example.com)" "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrsearch=ocean%20waves%20filetype:video&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime|mediatype|extmetadata|user&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|AttributionRequired"
   ```

### 2.8 NASA Image and Video Library (keyless) [LIVE]
1. **Offers:** images, video and audio. A search for "rocket launch" with `media_type=video` returned 1,444 hits.
2. **Auth:** none. Do not confuse it with api.nasa.gov, which needs a key.
3. **Endpoints:** base `https://images-api.nasa.gov`.
   - `GET /search`: `q`, `media_type` = `image,video,audio`, `center`, `keywords`, `title`, `description`, `photographer`, `secondary_creator`, `location`, `nasa_id`, `year_start`, `year_end`, `page`, `page_size` (default 100).
   - **Response:** `collection.items[]`. Each item has:
     - `data[0].{nasa_id,title,description,keywords,center,date_created,photographer,media_type}`
     - `links[]` (preview JPGs)
     - `href`: a `collection.json` manifest listing `~orig.mp4`, `~large.mp4`, `~medium.mp4`, `~small.mp4`, `~mobile.mp4`, `~preview.mp4`, `.vtt` and `metadata.json`.
   - `GET /asset/{nasa_id}` returns the same file list. `GET /metadata/{nasa_id}` returns `{location: …/metadata.json}`.
   - `metadata.json` holds `QuickTime:Duration`, `QuickTime:ImageWidth/Height`, `QuickTime:VideoFrameRate` and `XMP:Credit`.
   - Asset URLs come back as `http://`; rewrite them to https.
4. **Rate limits:** none documented.
5. **License:** NASA material is "generally not subject to copyright in the United States". Commercial use is fine as long as it does not "explicitly or implicitly convey NASA's endorsement".
   - The NASA insignia and logos are protected.
   - Identifiable current employees cannot appear in ads.
   - Acknowledge NASA as the source.
   - **Third-party material:** the example result had `photographer: "Rocket Lab"` / `XMP:Credit: Rocket Lab`. Skip items whose credit isn't NASA, or flag them for review.
6. **Example [LIVE]:** `curl "https://images-api.nasa.gov/search?q=rocket%20launch&media_type=video&page_size=20"`

### 2.9 Internet Archive (public-domain films and audio, keyless) [LIVE]
1. **Offers:** movies and audio.
   - About 443k `mediatype:movies` items have a `licenseurl` containing "publicdomain".
   - Prelinger Archives: 10,468 items.
2. **Auth:** none for search and download.
3. **Endpoints:**
   - **Search:** `GET https://archive.org/advancedsearch.php?q=<lucene>&fl[]=identifier&fl[]=title&fl[]=licenseurl&fl[]=year&rows=50&page=1&output=json`
     - Example `q`: `title:(ocean) AND mediatype:movies AND (licenseurl:*publicdomain* OR licenseurl:*cc0*)`
     - Collection example: `collection:prelinger`.
     - Response: `response.numFound`, `response.docs[]`.
   - **Deep paging:** `GET https://archive.org/services/search/v1/scrape?q=…&fields=identifier,title,licenseurl&count=100` (cursor based).
   - **Files:** `GET https://archive.org/metadata/{identifier}` returns `files[]{name, format ("h.264", "512Kb MPEG4", "MPEG2", "Ogg Video"…), width, height, length (s), size, source (original|derivative)}` and `metadata.licenseurl`.
   - **Download:** `https://archive.org/download/{identifier}/{name}` (302 to a datanode; verified 200 video/mp4).
4. **Rate limits:** none formally published. Be polite: serial requests and a User-Agent.
5. **License:** whatever the uploader declares in `licenseurl`. Accept only `publicdomain/mark`, `publicdomain/zero`, `licenses/publicdomain`, and `licenses/by/`.
   - **Risk:** public-domain status is uploader-asserted, and old films can contain copyrighted soundtracks. Prelinger footage is also sold by Getty, and PD footage occasionally draws erroneous Content ID claims. Prefer muting the original audio.
6. **Example [LIVE]:**
   `curl "https://archive.org/advancedsearch.php?q=collection%3Aprelinger+AND+mediatype%3Amovies+AND+city&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=licenseurl&rows=3&output=json"`

### 2.10 Jamendo API (music)
1. **Offers:** independent music under CC licenses. Openverse indexes about 645k Jamendo tracks.
2. **Auth:** free `client_id` query parameter from the app you create at https://devportal.jamendo.com. Without it the API returns `"code":5 … Invalid Client Id` (verified).
3. **Endpoint:** `GET https://api.jamendo.com/v3.0/tracks/`
   - **Parameters:** `client_id`, `format=json`, `limit` (≤200), `offset`, `search`, `namesearch`, `tags` (AND), `fuzzytags` (OR), `vocalinstrumental=instrumental`, `speed=…`, `durationbetween=60_180`, `audioformat` / `audiodlformat` = `mp31|mp32|ogg|flac`, `include=licenses+musicinfo`, `boost=popularity_month` (use instead of `order` when searching).
   - **License booleans:** `ccsa`, `ccnd`, `ccnc`. The docs are vague on their semantics, so filter client-side on `license_ccurl` and reject `-nc` / `-nd` (and `-sa` by default).
   - **Response:** `results[]{id, name, duration (s), artist_name, album_name, license_ccurl, audio (stream), audiodownload, audiodownload_allowed, shareurl, shorturl, image}`.
   - `audiodownload` is empty when `audiodownload_allowed` is false. Honor that flag.
4. **Rate limits:** the "Non-Commercial Apps" tier allows up to 35,000 requests/month.
5. **License:**
   - **API terms §3.3:** "The API may be used freely for non-commercial uses". Commercial use, which includes advertising revenue, must be negotiated with licensing@jamendo.com. You must credit the artists and Jamendo and backlink each track.
   - The *content* license is the track's CC license. CC BY permits a monetized video.
   - **Content ID:** Jamendo only registers tracks the artist opts in, and only if they are All Rights Reserved or CC BY-NC-ND 4.0. CC BY tracks are not Jamendo-registered.
   - **Practical:** for a personal monetized-channel tool, **getting Jamendo through Openverse avoids the Jamendo API commercial-use question entirely.**
6. **Example [DOCS sample call]:**
   `curl "https://api.jamendo.com/v3.0/tracks/?client_id=$JAMENDO_CLIENT_ID&format=json&limit=20&search=lofi&vocalinstrumental=instrumental&include=licenses+musicinfo&audioformat=mp32"`

### 2.11 Freesound (SFX)
1. **Offers:** about 592k CC sounds (Openverse count).
2. **Auth:**
   - **Token key** from https://freesound.org/apiv2/apply ("Client secret/Api key"). Send `Authorization: Token KEY` or `?token=KEY`. This is enough for search and previews.
   - **OAuth2** (authorization code; the code lives 10 min, the access token 24 h) is required for **original file download** (`/apiv2/sounds/<id>/download/`).
3. **Endpoint:** `GET https://freesound.org/apiv2/search/`
   - It replaces `/apiv2/search/text/`, deprecated Nov 2025, which still redirects.
   - **Parameters:** `query`, `filter` (Solr), `sort` (`score`, `duration_asc|desc`, `downloads_desc`, `rating_desc`, `created_desc`…), `fields` (always set it), `page`, `page_size` (max 150).
   - **Filter syntax:** `license:"Creative Commons 0"` (values: `"Attribution"`, `"Attribution NonCommercial"`, `"Creative Commons 0"`; legacy Sampling+ also exists) and `duration:[0 TO 3]`.
   - **Fields:** `id`, `name`, `url` (page), `username`, `license`, `duration` (s), `previews{preview-hq-mp3 (~128 kbps), preview-lq-mp3, preview-hq-ogg (~192 kbps), preview-lq-ogg}`, `download` (OAuth2), `tags`, plus `gen_ai_preference`.
4. **Rate limits:** standard keys get 60 req/min and 2,000 req/day. Original downloads and other write-like calls get 30/min and 500/day.
5. **License:**
   - CC0: anything.
   - CC BY: credit, with the suggested form: `"sound1" by user1 (http://freesound.org/s/soundID/) licensed under CC BY 4.0`.
   - BY-NC: not for monetized use.
   - Sampling+: excludes ads; treat it as excluded.
   - **Content ID:** the Freesound FAQ explains that raw SFX reused inside a registered song can trigger matches. Dispute with the Freesound page as evidence; modifying the sound reduces matches.
   - API ToS: commercial *API* use is negotiated case by case, and you must not copy the database.
6. **Example [DOCS; endpoint verified to return 401 without a key]:**
   ```bash
   curl -H "Authorization: Token $FREESOUND_API_KEY" \
    'https://freesound.org/apiv2/search/?query=whoosh&filter=license:%22Creative%20Commons%200%22%20duration:%5B0%20TO%203%5D&fields=id,name,url,username,license,duration,previews&sort=downloads_desc&page_size=50'
   ```

### 2.12 ccMixter (keyless) [LIVE]
1. **Offers:** CC-licensed remixes and instrumentals, many tagged `in_video` / `music_for_film`. 1,417 uploads have `lic=by` + `instrumental`; 339 are CC0 (`lic=zero`).
2. **Auth:** none. The server is old (Apache 2.2 / PHP 5.4), so use long timeouts.
3. **Endpoint:** `GET https://ccmixter.org/api/query`
   - **Parameters:** `f=json` (or `f=count`), `tags=instrumental+chill`, `type=any|all`, `reqtags`, `lic=by|zero|…` (`cc0` is invalid; use `zero`), `sort=rank|date|…`, `limit`, `offset`, `u=<user>`.
   - **Response** is an array of `{upload_name, user_name, file_page_url, license_name, license_url, upload_tags, files[]{download_url, file_format_info{ps (duration "2:45"), mime_type}}}`.
4. **Rate limits:** none documented.
5. **License:** per upload. For CC BY, credit as `"Title" by user (file_page_url), CC BY 3.0`. Remixes inherit the most restrictive source license, which is already reflected in `license_name`.
6. **Example [LIVE]:** `curl "https://ccmixter.org/api/query?f=json&tags=instrumental&lic=by&sort=rank&limit=20"`

### 2.13 Incompetech / Kevin MacLeod (keyless catalog) [LIVE]
1. **Offers:** 1,443 tracks.
2. **Auth:** none. **Not an official API.** It is the site's own catalog file.
3. **Endpoints:**
   - `GET https://incompetech.com/music/royalty-free/pieces.json` returns an array of `{title, filename, length "HH:MM:SS", instruments, genre, bpm, description, feel, uploaded, isrc, …}`.
   - Download: `https://incompetech.com/music/royalty-free/mp3-royaltyfree/<urlencoded filename>` (verified 200).
   - There is no server-side search; download the JSON once, cache it, and filter by `feel`, `bpm` and `length` locally.
4. **Rate limits:** none documented. Cache the JSON.
5. **License:** CC BY 4.0. The FAQ: "for YouTube videos? Yes, AND you can monetize the videos. Be sure to credit me."
   - **Exact credit:**
     ```
     <Title> Kevin MacLeod (incompetech.com)
     Licensed under Creative Commons: By Attribution 4.0
     https://creativecommons.org/licenses/by/4.0/
     ```
   - **Content ID:** the music is now **pre-registered**. Claims usually mean the credit is missing or only inside the video. Add the credit to the *description*, then dispute; the claim is released within 72 h. `isrc` is in the JSON for disputes.
   - A paid Standard License exists for no-attribution use.
6. **Example [LIVE]:** `curl -s https://incompetech.com/music/royalty-free/pieces.json | jq '.[] | select(.feel|test("Calm"))|.title'`

### 2.14 Free Music Archive
The site is live and run by Tribe of Noise since 2019. **There is no public API**: the old `freemusicarchive.org/api/get/...` returns 404 and `/api` is a 404 page. Tracks are under various CC licenses. FAQ topics include Content ID flags on CC music. Use it manually only.

### 2.15 YouTube Audio Library
**No API.** It exists "exclusively in YouTube Studio" (Studio > Audio library > hover > DOWNLOAD gives an MP3).
- YPP members can monetize with it.
- "Copyright-safe music and sound effects downloaded from the Audio Library won't be claimed by a rights holder."
- Some tracks are CC BY 4.0, which requires a description credit; Studio has a copy button for the text. Others are "Attribution not required".
- Off-YouTube use is not addressed.

### 2.16 Uppbeat
No public API or developer program found. Uppbeat pages returned 429 to automated fetches, so this is **[UNVERIFIED]** beyond search-indexed Uppbeat pages.
- **Free tier:** a per-download, per-video "Uppbeat Credit" code pasted into the description clears claims. Uppbeat's own pages conflict on whether the free license covers monetized content.
- **Paid tiers:** YouTube channel safelisting (1/3/10 channels depending on plan).
- Use: manual only.

### 2.17 Epidemic Sound
- **Catalog:** 55,000+ tracks and 250,000+ SFX.
- **API:** base `https://api.epidemicsound.com` (legacy `partner-content-api.epidemicsound.com` for `/v0`).
  - Header `Authorization: Bearer epidemic_live_…`, optional `x-partner-user-id`. Connect is OAuth 2.0 + PKCE for subscribers.
  - The **Free plan is "for prototyping"**: up to 50 downloads, no commercial license, and you can't go live on it. Scale and Enterprise are through sales.
- **MCP server (beta) for individual creators:** `https://www.epidemicsound.com/a/mcp-service/mcp`.
  - Claude Code uses an API key generated in ES account settings; setup is at https://developers.epidemicsound.com/docs/mcp/#claude.
  - It searches music and SFX (mood/BPM/genre/reference) and cuts music to length.
  - "Downloading music and using it in your content and projects requires an active, paid Epidemic Sound subscription." Monetization follows the subscription terms.
  - **For a subscriber this is the cleanest automated path.**
  - ES's channel clearance is **[UNVERIFIED this session]**.

### 2.18 Storyblocks
- **Base and auth:** `https://api.storyblocks.com`, HMAC-SHA256.
  - Query parameters `APIKEY`, `EXPIRES` (≤36 h ahead) and `HMAC`.
  - The HMAC is `hex(hmac_sha256(key = secret + expires, data = resource path))`.
  - `user_id` and `project_id` are required on search and download.
- **Endpoints:**
  - `GET /api/v2/videos/search?keywords=&content_type=&quality=&min_duration=…`
  - `GET /api/v2/audio/search?keywords=&min_duration=&max_duration=…`
  - `GET /api/v2/{videos|audio|images}/stock-item/download/:id`
  - `POST /api/v2/audio/whitelist/youtube?user_id=&youtube_channel_id=`
  - `POST /api/v2/audio/dispute`
- **Keys:** free *test* keys at https://developer.storyblocks.com/register are "restricted to internal use, solely for testing purposes". Full keys go through enterprise@storyblocks.com.
- **Verdict:** not viable for a free personal tool.

### 2.19 Shutterstock
- **Auth:** OAuth 2.0, or basic auth with consumer key and secret on some endpoints. A `User-Agent` is required.
- **Credentials:** create an app at https://www.shutterstock.com/account/developers/apps.
- **Endpoints:** `GET https://api.shutterstock.com/v2/videos/search?query=&aspect_ratio=16_9…` and `GET /v2/audio/search?query=&instruments=&duration_from=…`.
- **Free accounts:** "show results only from a limited library". Downloads need "An active subscription that is valid for the type and size of media".
- **Rate limits:** per-minute, with `RateLimit-*` headers.
- **Verdict:** paid.

### 2.20 Artlist
Enterprise-only Music API at https://developer.artlist.io (docs updated Jan 2026). Access is through an account manager or enterprise-api-support@artlist.io. Footage is not offered through the API.

### 2.21 Other options found
- **Sonniss GDC bundle** (SFX, manual): https://gdc.sonniss.com/. 7.47 GB+, 347+ files, "royalty-free and commercially usable", "No attribution is required"; AI training prohibited. Available as zip or torrent. A good one-time local SFX library the tool can index offline.
- **Freepik/Magnific API:** paid stock video and music (see 2.4).
- **Not suitable:** BBC Sound Effects. Its RemArc license is non-commercial, so it can't be used in monetized videos. Noted from general knowledge, not re-verified.

---

## 3. Things that are not possible through an API, with manual alternatives
| Want | Status | Manual alternative |
|---|---|---|
| YouTube Audio Library | no API | Studio > Audio library > DOWNLOAD. The tool watches `~/Reels/_library/music/` and records the track name and credit text the user pastes |
| Pixabay music / SFX | not in the documented API | download on pixabay.com; keep the **license certificate** (shield tracks) next to the file |
| Mixkit video / music / SFX | no API | manual download; check the Free vs Restricted video license |
| Uppbeat | no public API | manual; paste the Uppbeat Credit in the description (free) or safelist the channel (paid) |
| Free Music Archive | API gone | manual; check per-track CC license (no NC/ND) |
| Freesound original WAV | OAuth2 only | use `preview-hq-mp3` (fine for SFX), or a one-time OAuth flow |
| Epidemic Sound | needs a paid subscription | official MCP server with the subscriber's API key |

---

## 4. Implementation notes for the CLI
- **Normalized record:**
  ```
  {provider, id, kind: video|music|sfx|image, title, page_url, file_url, width, height, duration_s, author, author_url, license_code, license_url, attribution_text, requires_attribution, content_id_note, downloaded_at, sha256}
  ```
- **Credits file:** write one record per asset to `<reel>/assets/credits.json` and a ready-to-paste `description-credits.txt`. Incompetech, CC BY and YouTube Audio Library CC tracks *need* the credit in the YouTube description.
- **License allowlist:** default `{cc0, pdm, pexels, pixabay, coverr, nasa-pd, by}`. Opt-in for `by-sa`. Never `nc`, `nd`, `sampling+`.
- **Normalize units:** Openverse `duration` is in ms; Pexels, Pixabay, Coverr, Jamendo and Freesound are in seconds; Internet Archive `length` is in seconds as a string; ccMixter `ps` is "m:ss"; Incompetech is "HH:MM:SS".
- **Picking renditions:**
  - Pexels: choose the `video_files` entry with the smallest width ≥ the target.
  - Pixabay: `large` → `medium` fallback when `large.url == ""`.
  - Coverr: there's only `mp4_download`, so PATCH the stats.
  - NASA: `~large.mp4` or `~orig.mp4`.
  - Commons: the original, or a `derivatives` entry.
- **Portrait reels:** Pexels `orientation=portrait`, Coverr `is_vertical`, Pixabay (filter `height > width` client-side), Openverse images `aspect_ratio=tall`.
- **Etiquette:** Pixabay needs a 24h cache. Openverse anonymous is 20/min and 200/day. Pexels is 200/h. Freesound is 60/min and 2,000/day. Wikimedia needs a descriptive User-Agent and serial requests. Respect `Retry-After` and 429.
- **Keys:** read from env vars `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `FREESOUND_API_KEY`, `JAMENDO_CLIENT_ID`, `COVERR_API_KEY`. Skip providers whose key is missing, so the keyless set still works.
- **YouTube policy note:** monetization also depends on the YPP "reused content" policy. Talking-head videos with stock b-roll are fine. Videos made mostly of unaltered stock clips are not.

---

## 5. Sources (first-party)
- Pexels API docs https://www.pexels.com/api/documentation/ · License https://www.pexels.com/license/
- Pixabay API docs https://pixabay.com/api/docs/ · License summary https://pixabay.com/service/license-summary/ · Content ID certificate guide https://pixabay.com/blog/posts/how-to-clear-a-youtube-content-id-claim-with-a-pix-190/ · FAQ https://pixabay.com/service/faq/
- Coverr API https://api.coverr.co/docs/ (start, auth, videos, audios) · License https://coverr.co/license
- Openverse API https://api.openverse.org/v1/ (schema `/v1/schema/`) · ToS https://docs.openverse.org/terms_of_service.html
- Wikimedia API etiquette https://www.mediawiki.org/wiki/API:Etiquette · Rate limits https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits
- NASA images API doc https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf · Media guidelines https://www.nasa.gov/nasa-brand-center/images-and-media/
- Internet Archive advancedsearch / metadata / scrape (live) · Prelinger collection metadata https://archive.org/metadata/prelinger
- Jamendo tracks https://developer.jamendo.com/v3.0/tracks · API terms https://devportal.jamendo.com/api_terms_of_use · Content ID (artists) https://support-artist.jamendo.com/youtube-content-id
- Freesound API resources https://freesound.org/docs/api/resources_apiv2.html · Auth https://freesound.org/docs/api/authentication.html · Overview/throttling https://freesound.org/docs/api/overview.html · API ToS https://freesound.org/help/tos_api/ · FAQ https://freesound.org/help/faq/
- ccMixter query API https://ccmixter.org/query-api
- Incompetech FAQ https://incompetech.com/music/royalty-free/faq.html · Content ID https://incompetech.com/music/royalty-free/youtube-contentid.html · YouTube FAQ https://incompetech.com/music/royalty-free/youtubeFAQ.html
- YouTube Audio Library https://support.google.com/youtube/answer/3376882
- Mixkit licenses https://mixkit.co/license/ (modals `/license/modal/{musicFree,sfxFree,videoFree,videoRestricted}/`)
- Magnific (Freepik) docs https://docs.magnific.com/ (videos, ratelimits, pricing)
- Epidemic Sound developers https://developers.epidemicsound.com/ (docs, auth) · MCP https://www.epidemicsound.com/tools/mcp/
- Storyblocks API reference https://documentation.storyblocks.com/
- Shutterstock API reference https://api-reference.shutterstock.com/
- Artlist developer portal https://developer.artlist.io/
- CC BY-SA 4.0 legal code (sync = Adapted Material) https://creativecommons.org/licenses/by-sa/4.0/legalcode.en
- Sonniss GDC bundle https://gdc.sonniss.com/
