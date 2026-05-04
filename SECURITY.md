# 🛡️ 777 Global Inventory Security Model

This document outlines the security measures implemented in the 777 Global Inventory system.

## 1. Application Security (Frontend)
- **Content Security Policy (CSP)**: Implemented via Cloudflare `_headers` to restrict resource loading to trusted domains (Firebase, Google APIs).
- **Security Headers**: HSTS, XSS Protection, and Clickjacking protection (X-Frame-Options) enabled via `public/_headers`.
- **Environment Management**: Firebase configuration uses Vite environment variables (`.env`) to separate infrastructure config from source code.
- **Data Validation & Sanitization**: All inputs are sanitized using a custom `sanitizeForFirestore` utility to prevent injection of `undefined` or malformed fields. Critical entities (Locations, Brands, Items) now have strict validation checks to prevent duplicates and ensure data quality.
- **Production Hardening**: Source maps are disabled in production builds (via `vite.config.ts`) and aggressive code splitting is used to obfuscate internal patterns.

## 2. Infrastructure Security (Cloudflare)
- **DDoS Protection**: Managed by Cloudflare edge network.
- **HTTPS Enforcement**: 100% TLS encryption for all data in transit.
- **IP Restrictions**: (Recommended) IP-based access control can be enabled in the Cloudflare WAF for sensitive paths if needed.

## 3. Database Security (Firebase)
- **Distributed Locking**: A custom transaction lock manager (`src/lib/transactionLocks.ts`) prevents race conditions and data corruption during concurrent operations.
- **Schema Validation**: `firestore.rules` enforces strict data structures and types for every document write, even when authentication is disabled.
- **Real-time Integrity**: Weighted average cost (WAC) calculations are performed within atomic transaction blocks.

## 4. Operational Controls
- **Audit Logging**: Transactions, sales, and returns are permanently logged with timestamps and performer metadata.
- **Role-based Logic**: While the login page is temporarily disabled, the application maintains role-based data structures (Super Admin, Admin, Staff) in the code for future reactivation of granular permissions.

---
**Status:** Security Hardened (No-Auth Active) ✅  
**Last Review:** April 2026
