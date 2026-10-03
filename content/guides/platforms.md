# Free hosting comparison

Checked against official documentation on 2026-10-04. This ranking is for static EdgePress output. Function, database and CDN allowances are different meters; they cannot be added together.

| Priority | Platform | Free allowance relevant to this site | Conditions |
| --- | --- | --- | --- |
| 1 | Cloudflare Static Assets | Unlimited free static requests; Workers Builds includes 3,000 build minutes/month | A static-only deployment does not consume Worker function calls. See [asset pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [build limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/). |
| 2 | Tencent EdgeOne Pages | Currently unlimited website traffic and requests; 500 builds/month, 40 projects, 5 GB project storage | Current generous free-phase limits may change when commercialization starts. See [FAQ](https://pages.edgeone.ai/document/faqs) and [quotas](https://pages.edgeone.ai/document/limits-and-quotas). |
| 3 | Vercel Hobby | 100 GB Fast Data Transfer, 1 million CDN requests/month | Personal, non-commercial use; quotas reset monthly. See [Hobby](https://vercel.com/docs/plans/hobby). |
| 4 | Netlify Free, current credit plans | 300 shared credits/month; production deploy costs 15, bandwidth costs 20/GB, requests cost 2/10,000 | 15 GB is a theoretical bandwidth-only upper bound before deploys and requests. Exhaustion pauses the site until reset. Older accounts can have different legacy plans. See [credit plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/). |
| Verify separately | Alibaba Cloud ESA Pages | Pages traffic uses the selected site's package allowance | The 100,000/day free function allowance is not a static traffic allowance. No universal free Pages bandwidth limit was verified, so ESA is not ranked above documented free plans. See [official billing](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/functions-and-pages-billing). |

Cloudflare and EdgeOne both offer the largest published static allowance. Cloudflare comes first for this project because its static deployment and build-minute allowance are established; EdgeOne can be preferable for the audience's measured network performance. This is a practical recommendation, not a numerical comparison between build minutes and build counts.

All platforms receive the same `dist/`. CSS, JavaScript and their local dependencies have content hashes and one-year immutable caching. HTML and unversioned metadata remain refreshable. ESA requires equivalent cache rules in its console. External services have separate quotas and are called only with current consent and a matching page or visitor action. Homepages have no discussion slot.
