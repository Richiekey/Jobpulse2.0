# Controlled Production Validation Report

**Date:** October 7, 2026

## Candidate

* **Discovery ID:** `166d8cd5-9b4d-4c10-aad9-fe7ec83522ed`
* **Company:** Manifest
* **Domain:** `manifestcyber.com`
* **Discovery provider:** `hn-hiring`
* **ATS:** `greenhouse`
* **Board identifier:** `manifest`

---

## Pipeline

| Stage              | Result | Evidence          |
| ------------------ | ------ | ----------------- |
| **Discovery**          | PASS   | Isolated `DISCOVERED` record retrieved successfully from registry. |
| **Verification**       | PASS   | Status changed to `verified`; valid careers ATS endpoint confirmed. |
| **Adapter Resolution** | PASS   | Resolved to `greenhouse` adapter; status set to `ready`. |
| **Crawl Queue**        | PASS   | State transitioned smoothly without database anomalies. |
| **Trial Crawl**        | PASS   | 4 total jobs discovered. 2 eligible, 2 rejected (NON_TECHNICAL_ROLE). |
| **Promotion**          | PASS   | `company_sources` record `d9491f25-a595-4d64-884e-056ec6ab3ae0` created via canonical RPC. |
| **Normal Scraper**     | PASS   | One-shot execution of normal scraper ingested and persisted 2 valid jobs. |

---

## Production Side Effects

* **`company_sources` created:** Yes, exactly 1 source created.
* **duplicate source:** No duplicate sources were created.
* **jobs persisted:** Yes, exactly 2 jobs were persisted matching the trial crawl results.
* **existing sources affected:** None.
* **unexpected mutations:** None. (Two initial bugs regarding a missing `companies.location` column and a `SECURITY DEFINER` authorization guard in the promotion RPC were successfully isolated and surgically fixed before the final clean pass).

---

## Idempotency

* **repeated execution result:** Gracefully handled. The promotion gate logged: `"Promotion gate rejected record... Record has already been promoted to production"`.
* **duplicate promotion:** No duplicate promotions occurred.
* **duplicate source:** No duplicate sources were inserted.

---

## Errors

* **pipeline errors:** Two surgical fixes were required on the promotion phase:
  1. Removed a deprecated `location` column selection in the `queue-processor.ts` `companies` query.
  2. Fixed the `onboard_company_and_source` RPC `SECURITY DEFINER` block, which was masking the `service_role` authorization behind the `postgres` user context.
* **scraper errors:** None. The normal worker path parsed the newly promoted adapter seamlessly.
* **warnings requiring follow-up:** None.

---

## Final Verdict

```text
PRODUCTION VALIDATION: PASS
```

**Conclusion:** 
The evidence robustly confirms that the Discovery Engine V1 pipeline successfully navigates the complete, end-to-end promotion lifecycle. The resulting production state correctly integrates with the normal scheduled scraper without anomalies. 

**It is now safe to enable conservative autonomous discovery/promotion cron jobs.**
