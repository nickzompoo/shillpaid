# SHILLPAID: payment setup

Listing fees are paid through NOWPayments. Each person gets their own checkout link.
NOWPayments sends the money to your treasury wallet. Your wallet address never appears on the site.

## 1. NOWPayments account
1. Sign up at https://nowpayments.io.
2. Settings → Payment settings: add your payout wallet for SOL:
   8HvW7T9uRuNj7zHugguzeYiqs1Lw4Zqay4AQKP8ysfVv
3. Settings → API keys: create an API key.
4. Settings → Payment settings → Instant Payment Notifications: generate an IPN secret key.

## 2. Deploy to Netlify
The payment system uses Netlify Functions, so drag-and-drop deploy will NOT work.
Use one of these:
- Put this folder in a GitHub repo, then Netlify → Add new site → Import from Git.
- Or install the Netlify CLI and run: `netlify deploy --prod` inside this folder.

## 3. Environment variables (Netlify → Site configuration → Environment variables)
| Name | Value |
|---|---|
| NOWPAYMENTS_API_KEY | your API key |
| NOWPAYMENTS_IPN_SECRET | your IPN secret |
| LISTING_PRICE_AMOUNT | 0.1 (optional, default 0.1) |
| LISTING_PRICE_CURRENCY | sol (optional, default sol) |
| LISTING_PAY_CURRENCY | sol (optional, default sol) |

Redeploy after adding them.

## 4. Test
Launch a test campaign, press Pay now, pay 0.1 SOL. Within a few minutes the window
should say "Payment received" and the campaign appears on the Market tab.
If creating the link fails, open Netlify → Logs → Functions → create-invoice to see the error.
If NOWPayments rejects "sol" as the price currency, set LISTING_PRICE_CURRENCY=usd
and LISTING_PRICE_AMOUNT to the dollar price.
