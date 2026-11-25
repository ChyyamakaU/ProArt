# SkillVerify

SkillVerify is a professional identity and skills-verification platform for skilled workers in Nigeria. This repository contains the React/Vite frontend and the Express/PostgreSQL backend.

## Run the synthetic investor demo

Install a supported Node.js LTS release (Node.js 24 recommended), npm, and local PostgreSQL. Create an **empty** database named `skillverify_investor_demo` using a local PostgreSQL role that can connect, create the schema, and enable `pgcrypto`.

```text
git clone https://github.com/ChyyamakaU/SkillVerify.git
cd SkillVerify
```

In the first terminal, install and start the demo backend. This PowerShell example uses a placeholder connection string. Replace `LOCAL_USER` and `LOCAL_PASSWORD` with your local database role and password.

```powershell
cd backend
npm.cmd ci
$env:SKILLVERIFY_DEMO_DATABASE_URL = 'postgresql://LOCAL_USER:LOCAL_PASSWORD@127.0.0.1:5432/skillverify_investor_demo'
npm.cmd run demo:verification
```

On macOS or Linux, use `npm` and set the same connection URL with `export SKILLVERIFY_DEMO_DATABASE_URL='...'`. The launcher applies the schema, creates five fictional worker profiles and an administrator, copies the bundled portraits and work samples, creates clearly labelled synthetic ID images, and generates fresh signing and encryption keys in memory. It refuses to seed a database that already contains accounts or workers.

In a second terminal, start the frontend:

```text
cd frontend
npm ci
npm run dev
```

Open [the directory](http://localhost:5173/workers). The default API is [localhost:4000](http://localhost:4000/api/health).

| Demo account | Phone |
| --- | --- |
| Worker, Amara Okafor | `2340000000001` |
| Administrator | `2340000000002` |

Both use the local-only synthetic demo password `SkillVerify-Demo-Only-2026!`. The backend prints the other synthetic logins and the matching generated ID images for this run. Submit a work sample and synthetic ID in the worker dashboard, review both in a separate administrator tab, then refresh the public Trust Card. Only approved Identity and Skill Verification results appear. Contact Verification is marked as coming soon.

Press Ctrl+C in both terminals to stop. For another fresh rehearsal, point the launcher at a fresh, empty **dedicated demo database** with the required name. Keep real records and real identity documents outside the demo environment.

- [Backend setup and PostgreSQL integration tests](backend/README.md)
- [Frontend setup and build](frontend/README.md)
