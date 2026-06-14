# System Architecture & Service Level Agreement

## 1. Project Overview

This document details the architectural specifications, implemented features, and operational terms for the multi-location Inventory and Sales Management System. The application is a high-performance, cloud-native solution designed to streamline wholesale and retail operations across central warehouses and distributed shop locations.

## 2. Technology Stack & Infrastructure

The system is built on a modern, enterprise-grade technology stack ensuring scalability, security, and real-time performance.

* **Frontend Framework:** React.js with TypeScript (enabling strict type-safety and robust component architecture).
* **User Interface (UI):** Tailwind CSS, providing a responsive, clean, and highly customizable design language.
* **State Management:** Zustand, offering lightning-fast global state synchronization across all modules.
* **Backend Database:** Google Firebase Firestore, a highly scalable NoSQL cloud database providing real-time data synchronization and offline support.
* **Hosting & Edge Deployment:** Cloudflare Pages, delivering the application globally through edge servers for maximum speed and 99.99% uptime reliability.
* **Data Processing:** SheetJS (XLSX) library utilized for complex Excel import/export processing and local data parsing.

## 3. System Modules & Provided Features

* **Multi-Location Architecture:** Complete isolation and aggregation of data between Central Warehouses and distinct Shop locations.
* **Intelligent Inventory Engine:** Real-time tracking of Opening, Received, Supplied, Returned, and Closing balances for thousands of unique SKUs.
* **Global Import Utility:** Bulk Excel data ingestion with intelligent SKU deduplication, automated discrepancy handling, and real-time cost basis updating.
* **Sales & Point of Sale (POS):** Streamlined checkout interface supporting custom cart logic, dynamic discounting, and automated receipt generation.
* **Transfers & Returns:** Auditable, secure stock movement between locations, and robust handling of customer returns to active inventory.
* **Advanced Reporting:** Generation of Daily Sales Reports and comprehensive Global Stock Reports. Features include multi-format extraction (Clean PDF and Excel formats) with dynamic pagination.

## 4. Terms and Conditions

The following Service Level Agreement (SLA) outlines the conditions regarding ongoing maintenance and support for the deployed application:

* **Error Resolution (Bug Fixes):** Any functional errors, bugs, or system faults directly originating from the agreed-upon initial deployment scope will be investigated and resolved at **no additional charge**.
* **Maintenance & Future Modifications:** Any requests for structural modifications, new feature additions, layout redesigns, or architectural changes made **after** the final deployment will be considered separate work orders. These will be **charged accordingly** based on the specific requirements, complexity, and estimated hours of the requested work.

*By utilizing this system, all parties acknowledge and agree to the operational and maintenance terms outlined above.*
