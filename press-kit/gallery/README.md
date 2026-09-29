# Product Hunt gallery

Generated **1270×760** PNGs matching the AWC/MD3 desktop mockups on the
marketing site (`web/components/home/AppShowcase.tsx`).

| File | Shot |
| --- | --- |
| `01-hero.png` | Chat workspace / Material You chrome |
| `02-projects-rag.png` | Project with attached docs / RAG |
| `03-multi-agent.png` | Multi-agent trail |
| `04-models.png` | Models pool |
| `05-endpoint.png` | Local API `:3227` |

Regenerate after UI changes:

```bash
NODE_PATH=app/node_modules node scripts/generate-gallery-screenshots.js
```

Captions and upload order: [`docs/launch/product-hunt.md`](../../docs/launch/product-hunt.md).
