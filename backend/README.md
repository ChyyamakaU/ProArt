# SkillVerify backend

Apply the existing migration with `npm run db:migrate`. Phase 4B adds identity submissions and a document-access audit without creating verification decisions for existing workers.

Identity uploads and retrieval are disabled until `IDENTITY_ENCRYPTION_KEY` is configured. Set a dedicated 32-byte hex key through the deployment's secret configuration. Set `IDENTITY_UPLOAD_DIR` to a persistent directory outside every static web root. Give the API service account exclusive access to that directory, including through Windows ACLs where applicable. Run the API over HTTPS.

Keep the storage volume and backups private. Back up the encryption key separately and retain it while any file encrypted with it must remain readable. The current implementation uses one storage key and does not automate rotation, retention, file deletion, or orphan reconciliation. Establish those procedures before accepting real documents. Configure application, proxy, and database logging to exclude request bodies, bearer tokens, document bytes, and sensitive parameters.

The identity integration suite runs only when `SKILLVERIFY_PHASE4B_TEST_DATABASE_URL` points to a dedicated local database named `skillverify_phase4b_test`. The Phase 4A suite uses `SKILLVERIFY_PHASE4A_TEST_DATABASE_URL` and the separate `skillverify_phase4a_test` database.

## Investor demo

1. Create a dedicated, empty local PostgreSQL database named `skillverify_investor_demo`. Set `SKILLVERIFY_DEMO_DATABASE_URL` to its PostgreSQL connection URL using `127.0.0.1`, then run `npm run demo:verification` from `backend/`. The launcher refuses populated account or worker tables and prints the synthetic credentials, upload image locations, and public links. Keep it running during the demo. For each new rehearsal use a fresh empty database. Demo encryption and session keys live for that run only.
2. Run `npm run dev` from `frontend/` and open `http://localhost:5173`. The demo API uses port 4000 by default. If you set `SKILLVERIFY_DEMO_PORT`, set the matching frontend `VITE_API_URL`.
3. Sign in as Amara Okafor (`2340000000001`) or another listed synthetic worker. Each starts with a portfolio of three generated work images and a fictional portrait. View the Trust Card before submission to establish that it has no approval badges. In the dashboard, submit the matching synthetic document and choose an existing portfolio sample. Contact Verification displays **Coming soon**.
4. Open a separate browser tab and sign in as the synthetic admin. Visit **Verification reviews**. Open the private identity image, start review, and record the decision. Switch to **Skill reviews**, inspect the portfolio sample, start review, and record its decision.
5. Return to the worker dashboard and reopen the public card. Each verified pillar adds its own public indicator. To demonstrate feedback and resubmission, request resubmission for one pillar before approving it. The review reason appears only in the protected workflow. Use the generated fixture throughout. Do not upload real documents or use the synthetic account’s contact link.
