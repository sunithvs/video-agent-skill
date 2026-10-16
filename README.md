# video-agent-skill

Video editing skills for [Claude Code](https://claude.com/claude-code). Drop a talking-head recording in a folder,
paste a few links, and Claude edits it: transcript-timed motion graphics, captions, b-roll, sound design, loudness
mastering, and a finished MP4.

| Skill | For | What it does |
|---|---|---|
| **reel-editor** | Instagram Reels, TikTok, YouTube Shorts (1080x1920) | face layouts that morph (split screen, picture-in-picture card, punch-ins), kinetic text, cards and stamps timed to the words, English captions (also translated from Malayalam, Hindi, ...), X/Twitter posts and website shots as b-roll, the Clawd mascot, synced UI sound effects, several hook variants of one take |
| **youtube-editor** | full-length YouTube videos (1920x1080, 5-60 min) | automatic jump cuts, zoom changes on every cut, chapter cards + YouTube chapter timestamps, lower thirds, license-checked stock b-roll and music, `.srt` subtitles, a description with credits, a thumbnail; resumable chunked rendering |

Every frame is drawn by one HTML page as a pure function of time (`seek(t)`) and rendered with Playwright + ffmpeg,
so edits are exact, cheap to change and re-render (a 60 s reel renders in about 4 minutes, long-form at about 1.7 min
per minute of video). The method started from [remorses' ui-morph gist](https://gist.github.com/remorses/3d467b50a0519ef7859823046dc9c427).

## Install

**Claude Code plugin (recommended)**

```
/plugin marketplace add sunithvs/video-agent-skill
/plugin install video-editor@video-agent-skill
```

or from a shell: `claude plugin marketplace add sunithvs/video-agent-skill` then
`claude plugin install video-editor@video-agent-skill`. Restart Claude Code; the skills load as
`video-editor:reel-editor` and `video-editor:youtube-editor`.

**Manual** (personal skills folder, no plugin system)

```bash
git clone https://github.com/sunithvs/video-agent-skill && cd video-agent-skill
./install.sh            # copies into ~/.claude/skills  (--project: ./.claude/skills, --link: symlink)
```

**claude.ai**: `bash scripts/package.sh` builds `dist/reel-editor.skill` and `dist/youtube-editor.skill` to upload in
Settings > Capabilities > Skills. The skills need ffmpeg, Node and a browser on the machine they run on, so they are
built for Claude Code on your own computer; in the claude.ai sandbox expect only planning and previews to work.

## Requirements

- macOS or Linux, [ffmpeg](https://ffmpeg.org) (with ffprobe), Node 18+, [uv](https://docs.astral.sh/uv/) (Python
  scripts install their own dependencies), Google Chrome or `npx playwright install chromium`
- iPhone HDR footage: macOS `avconvert` (built in) or an ffmpeg build with `zscale`
- Transcription uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (downloads a model on first use)

## Use

Just ask, for example:

- "I added a new video in ~/Reels/launch-day, edit it into a reel. Use this post as b-roll: https://x.com/..."
- "Make three versions with different hooks, put the webinar details right after the hook"
- "Edit the recording in ~/Videos/episode-12 for YouTube: jump cuts, chapters, subtitles and a thumbnail"

Each video gets its own project folder (the skill scaffolds it): the edit is `edit.js`, renders land in `out/`.

### Stock footage and music

`scripts/stock.py` searches free sources and records the license of every file it downloads (credits go into the
YouTube description automatically). It only keeps licenses that are safe for monetized videos: CC0, public domain,
CC BY, and the Pexels, Pixabay and Coverr licenses; never NC or ND, and CC BY-SA only on request.

- Works with no key: Wikimedia Commons, NASA, Internet Archive (video); Openverse, Incompetech, ccMixter (music);
  Openverse/Freesound (sound effects)
- Free keys (sign up yourself) unlock Pexels, Pixabay, Coverr and Freesound. Put them in
  `~/.config/reel-tools/keys.json`:

```json
{ "PEXELS_API_KEY": "...", "PIXABAY_API_KEY": "...", "COVERR_API_KEY": "...", "FREESOUND_API_KEY": "..." }
```

Provider details, terms and Content ID notes (researched October 2026):
`plugins/video-editor/skills/youtube-editor/references/stock.md`.

## Layout

```
.claude-plugin/marketplace.json        marketplace (one plugin)
plugins/video-editor/
  .claude-plugin/plugin.json
  skills/reel-editor/                  SKILL.md, references/, examples/, assets/project (engine + scripts), scripts/
  skills/youtube-editor/               SKILL.md, references/, assets/project (engine + scripts), scripts/
install.sh                             manual install
scripts/package.sh                     build .skill files for claude.ai
```

## Notes

- **Clawd** (the pixel critter in `clawd()`) is the Claude Code mascot by Anthropic, redrawn from the CLI's block
  characters for Claude-themed videos. This project is not affiliated with or endorsed by Anthropic.
- You are responsible for the rights to what you put in a video: footage, posts and screenshots of other people's
  work, music. The skills credit third-party posts on screen and keep stock licenses in `assets/credits.json`.
- Code: Apache License 2.0 (see LICENSE). Bundled fonts (Archivo, Inter, Geist Mono): SIL Open Font License 1.1.
