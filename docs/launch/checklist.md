# Launch checklist

## Repository & GitHub

- [x] MIT `LICENSE` at repo root  
- [x] `SECURITY.md` with private contact  
- [x] `CONTRIBUTING.md`  
- [x] Public-facing `README.md` (product story + quick start)  
- [x] Launch kit under `docs/launch/`  
- [x] Brand / press-kit assets under `press-kit/` and `docs/brand/`  
- [ ] Set GitHub repo **description**: `Local-first LLM workspace for Ollama — projects, RAG, and one OpenAI-compatible endpoint.`  
- [ ] Set GitHub **homepage**: `https://anylm.app`  
- [ ] Add topics: `ollama`, `local-llm`, `electron`, `rag`, `openai-compatible`, `desktop`, `typescript`, `privacy`  
- [ ] Confirm latest GitHub Release (`v0.4.0`+) has macOS / Windows / Linux assets and release notes  
- [ ] Pin latest release; enable Discussions if you want launch Q&A  

*(Repo metadata must be set in GitHub Settings → General; the agent token is read-only for that API.)*

## Product & site

- [ ] https://anylm.app loads (hero, download CTA, no console errors)  
- [ ] https://anylm.app/download picks a sensible asset for each OS  
- [ ] https://anylm.app/releases lists history  
- [ ] https://anylm.app/privacy is linked from the footer  
- [ ] Open Graph / Twitter card preview looks correct (Slack, X, LinkedIn unfurl)  
- [ ] Favicon and apple-touch icon resolve  
- [ ] Fresh install path: Ollama missing → setup gate is understandable  
- [ ] Demo account or maker accounts ready for live AMA  

## Assets

- [x] Logo SVG + PNG sizes in `press-kit/`  
- [x] Social / OG image (`og.png` / `press-kit/social-1200x630.png`)  
- [x] Product Hunt thumbnail 240×240  
- [ ] Five gallery screenshots (1270×760) captured from a polished demo project — see `docs/launch/product-hunt.md`  
- [ ] Optional: 15–30s demo GIF or MP4 for PH / Twitter  

## Legal / trust

- [x] Privacy page published on the site  
- [ ] Confirm Firebase Auth providers enabled for production  
- [ ] Confirm Firestore rules deployed  
- [ ] Code signing: note unsigned builds need “Open Anyway” on macOS if secrets unset  

## Channels (day of)

| Channel | Draft | Done |
| --- | --- | --- |
| Product Hunt | `product-hunt.md` | [ ] |
| Hacker News Show HN | `social-posts.md` | [ ] |
| r/LocalLLaMA | `social-posts.md` | [ ] |
| X / Twitter | `social-posts.md` | [ ] |
| LinkedIn | `social-posts.md` | [ ] |
| Personal / community Discords | one-liner in `social-posts.md` | [ ] |

## Post-launch (48h)

- [ ] Collect feedback themes; open GitHub issues for top 3  
- [ ] Thank hunters / commenters; fix critical install bugs same day if possible  
- [ ] Update README “Featured on” only if PH/HN traction warrants it  
- [ ] Tag `v0.4.x` hotfix if download or first-run blockers appear  
