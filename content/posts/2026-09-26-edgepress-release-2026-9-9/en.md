---
title: "EdgePress September 2026 update: request 9"
author: toewpq
date: 2026-09-26
lang: en
slug: edgepress-release-2026-9-9
tags:
  - release
  - privacy
  - accessibility
description: A floating article contents widget, a compact consent interface, supplier privacy links, and expanded bilingual privacy disclosures.
---

This is the ninth requested EdgePress update for September 2026.

## Floating article contents

Long articles now reveal a compact table-of-contents control after the reader scrolls. It opens and closes on demand, supports keyboard dismissal, and moves to the lower-left corner on mobile screens.

## A clearer consent interface

The consent panel now keeps the service purpose and choice visible while placing data categories, recipients, retention, and the supplier's privacy page in expandable details. Accept and reject remain equally prominent. The configured site operator and privacy contact share a compact line in the policy.

Each configured browser service requires an HTTPS `privacyUrl`. The consent panel and generated privacy policy link to that page, and the privacy policy refreshes its provider list and consent dates from the current configuration at build time.

## Bilingual privacy disclosures

The English and Chinese policy pages describe request data, processing purposes and legal bases, visitor rights, consent withdrawal, configured retention, and cross-border processing information. They also state that the browser-only consent choice is not a server-side receipt.

Page-content layout and consent-interface checks remain separate in the audit report.
