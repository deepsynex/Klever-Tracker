# Google Maps API Key: Pricing and Usage

> Prices are from Google's [global pricing list](https://developers.google.com/maps/billing-and-pricing/pricing), checked on **2026-11-03**. Google changes prices, so check that page again before budgeting.

Google bills each SKU on its own. Every SKU has a **free monthly usage cap**, and anything above it is charged per 1,000 events. Since March 2025 these per-SKU caps have replaced the old $200 monthly credit. Usage is added up across all projects on the same billing account, and the free caps reset every month.

---

## 1. Dynamic Maps (Maps JavaScript API): Essentials

**Billable event:** one successful **map load**. Panning, zooming, markers, Advanced Markers, polylines and map IDs don't add charges.

| Monthly map loads | Price per 1,000 |
|---|---|
| 0 – 10,000 | **Free** |
| 10,001 – 100,000 | $7.00 |
| 100,001 – 500,000 | $5.60 |
| 500,001 – 1,000,000 | $4.20 |
| 1,000,001 – 5,000,000 | $2.10 |
| 5,000,000+ | $0.53 |

---

## 2. Routes API: Compute Routes

**Billable event:** one request. Google charges only the highest SKU a request triggers.

| SKU | What puts a request in this SKU |
|---|---|
| Essentials | Basic routing with 10 intermediate waypoints or fewer |
| Pro | 11–25 intermediate waypoints, waypoint optimization, traffic-aware routing, or a location modifier (heading, side of road, vehicle stopover) |
| Enterprise | Toll calculation, traffic info on polylines, two-wheeler or large-vehicle routing |

| Monthly requests | Essentials | Pro | Enterprise |
|---|---|---|---|
| Free cap | 10,000 | 5,000 | 1,000 |
| Cap – 100,000 | $5.00 | $10.00 | $15.00 |
| 100,001 – 500,000 | $4.00 | $8.00 | $12.00 |
| 500,001 – 1,000,000 | $3.00 | $6.00 | $9.00 |
| 1,000,001 – 5,000,000 | $1.50 | $3.00 | $4.50 |
| 5,000,000+ | $0.38 | $0.75 | $1.14 |

*Prices per 1,000 requests.*

---

## 3. Other common SKUs

| SKU | Free cap / month | First paid tier per 1,000 |
|---|---|---|
| Static Maps | 10,000 | $2.00 |
| 2D Map Tiles | 100,000 | $0.60 |
| Geocoding | 10,000 | $5.00 |
| Places Autocomplete Requests | 10,000 | $2.83 |
| Place Details Essentials | 10,000 | $5.00 |
| Place Details Pro | 5,000 | $17.00 |
| Place Details Enterprise | 1,000 | $20.00 |
| Compute Route Matrix Essentials | 10,000 | $5.00 |
| Directions (Legacy) | 10,000 | $5.00 |
| Roads: Route Traveled (snap to roads) | 5,000 | $10.00 |
| Roads: Nearest Road | 5,000 | $10.00 |

---

## 4. Monthly cost examples

These are rough estimates. Replace the numbers with real usage from the Cloud Console (**Google Maps Platform → Metrics**).

**Small fleet office: 20 users, 22 working days**
- Map loads: 20 users × 25 map views/day × 22 = 11,000 → (11,000 − 10,000) × $7 / 1,000 = **≈ $7**
- Routes (Pro): 20 × 3 route views/day × 22 × ~4 requests = 5,280 → (5,280 − 5,000) × $10 / 1,000 = **≈ $3**
- **Total ≈ $10 / month**

**Mid-size: 100 users**
- Map loads: 100 × 25 × 22 = 55,000 → 45,000 billable × $7 / 1,000 = **≈ $315**
- Routes (Pro): 100 × 3 × 22 × ~4 = 26,400 → 21,400 billable × $10 / 1,000 = **≈ $214**
- **Total ≈ $529 / month**

---

## 5. Keeping cost under control

- **Budget alerts:** Billing → Budgets & alerts. Set alerts at 50%, 90% and 100% of the monthly budget you expect. Alerts only notify you; they don't stop usage.
- **Hard quotas:** APIs & Services → select the API → **Quotas**. Lower *requests per day* to put a ceiling on spend.
- **Watch the Metrics page** every month for unexpected traffic.

---

## References

- Pricing list: https://developers.google.com/maps/billing-and-pricing/pricing
- Maps SKU details: https://developers.google.com/maps/billing-and-pricing/sku-details/maps
- Routes SKU details: https://developers.google.com/maps/billing-and-pricing/sku-details/routes
