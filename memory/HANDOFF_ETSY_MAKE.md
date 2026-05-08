# Etsy listing pipeline — current state (handoff)

## What works
- Make.com API token valid: `$MAKE_API_TOKEN` (zone eu1, org 7317371, team 1489856). Auth header: `Authorization: Token <token>`.
- Webhook created: `$MAKE_WEBHOOK_URL` (id 2857705). Will trigger the `brain-etsy-lister` scenario once it exists.
- Etsy OAuth connection exists (id 6715585, label "My Etsy connection", shop `TheSheetShopByAdarsh`).
- 2 templates ready to list: `Budget-Tracker-50-30-20.xlsx`, `Small-Business-Bookkeeping.xlsx` in `/home/ec2-user/adarsh-moneymaker/etsy-money/templates/`. Copy in `../listings/ETSY-LISTING-CONTENT.md` (title, desc, price).
- Mockups in `/home/ec2-user/adarsh-moneymaker/assets/generated/{budget-tracker,bookkeeping}/`.

## Blocker (needs Adarsh's 2-min manual step OR brain-found workaround)
The existing Etsy connection (id 6715585) was created for the custom Etsy app `etsy3` (per Make's accountName). The official `etsy:makeApiCall` module rejects this connection as incompatible. Module-name probes confirmed only `etsy:makeApiCall` exists as a public module; `etsy2:*` / `etsy3:*` return 404.

Two resolution paths:
1. **Adarsh creates a new Etsy connection** in Make.com against the official Etsy app, then the scenario can use `etsy:makeApiCall`. Then PATCH the scenario via API to reference the new connection id.
2. **Brain builds scenario using generic HTTP module + Etsy OAuth token.** Use `http:ActionSendData` (HTTP "Make a request" module) with Bearer token in the header — but this requires obtaining a live Etsy OAuth access token (refresh via Etsy OAuth2 endpoint). Not straightforward unattended.

## Next action for brain next cycle
1. Check `MAKE_API_TOKEN` and list connections: `curl -H "Authorization: Token $MAKE_API_TOKEN" "https://eu1.make.com/api/v2/connections?teamId=1489856"`.
2. If a connection with `accountName: etsy` (not `etsy3`) now exists — build a full scenario with `etsy:makeApiCall` using that connection id, then POST a sample listing payload to `$MAKE_WEBHOOK_URL`.
3. If not — send Telegram asking Adarsh to create one ("Make.com → Scenarios → New → add Etsy module → authorize"). Once it exists, brain proceeds.

## Blueprint template to use when connection is ready
```json
{"name":"brain-etsy-lister","flow":[
  {"id":1,"module":"gateway:CustomWebHook","version":1,"parameters":{"hook":2857705,"maxResults":1},"mapper":{},"metadata":{"designer":{"x":0,"y":0}}},
  {"id":2,"module":"etsy:makeApiCall","version":1,"parameters":{"__IMTCONN__":<NEW_CONN_ID>},"mapper":{"url":"/application/shops/<SHOP_ID>/listings","method":"POST","body":"<JSON>","qs":[],"headers":[]},"metadata":{"designer":{"x":300,"y":0}}}
],"metadata":{"version":1,"scenario":{"roundtrips":1,"maxErrors":3,"autoCommit":true,"autoCommitTriggerLast":true,"sequential":false,"confidential":false,"dataloss":false,"dlq":false,"freshVariables":false},"designer":{"orphans":[]}}}
```
Create scenario: `POST /api/v2/scenarios?confirmed=true` with body `{"blueprint": "<stringified JSON above>", "name":"brain-etsy-lister", "teamId":1489856, "scheduling":"{\"type\":\"on-demand\"}"}`.

## Etsy listing payload for Budget Tracker
Copy source: `/home/ec2-user/adarsh-moneymaker/etsy-money/listings/ETSY-LISTING-CONTENT.md`. Price $4.99. Type: digital. Shop: TheSheetShopByAdarsh.
