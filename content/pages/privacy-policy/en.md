---
title: Privacy policy
lang: en
slug: privacy-policy
description: How this site handles request data, consent choices, optional analytics, data rights, and supplier disclosures.
blocks:
  - columns: 1
    cells:
      -
        - type: section
          title: Controller and contact
          tone: soft
          blocks:
            - type: privacy-controller
              nameLabel: Controller
              contactLabel: Privacy contact
              missingTitle: Publication setup required
              missingText: Add the responsible person's or organization's real name and a working privacy contact in config.yml before publishing.
            - type: text
              text: Confirm that the configured name identifies the responsible person or legal entity. Add a postal address, EU representative, or data protection officer contact here when applicable to the operator.
  - columns: 2
    cells:
      -
        - type: section
          title: Site requests and legal bases
          blocks:
            - type: text
              paragraphs:
                - This site publishes pages and posts and provides client-side search. It has no visitor accounts, comments, or contact form in this build.
                - To deliver and protect the site, the hosting and network providers receive request data such as IP address, requested path, request time, and browser or device headers. Where GDPR applies, the operator relies on legitimate interests in serving a secure and reliable site (Article 6(1)(f)); the operator must document the balancing assessment and confirm actual hosting logs and retention in the deployment account.
                - Optional browser services listed below load only after an affirmative choice. Where their processing includes personal data and consent is the chosen legal basis, it is based on consent (Article 6(1)(a)). Refusing optional services does not prevent access to the site's basic pages.
      -
        - type: section
          title: Optional browser services
          blocks:
            - type: text
              text: This list is generated from enabled services in config.yml. It identifies each purpose, data category, recipient, retention period, and the supplier's own privacy information.
            - type: privacy-services
              emptyText: No optional third-party browser services are configured.
  - columns: 1
    cells:
      -
        - type: section
          title: Cloudflare Web Analytics
          blocks:
            - type: text
              paragraphs:
                - When accepted, the Cloudflare beacon reports page-view and browser performance metrics. Its published dimensions include page path, referrer, device, browser, operating system, and country. Cloudflare says its beacon receives the source IP as part of the HTTP request, discards it at the nearest data center, and does not store it in its core databases or logs; Cloudflare also says the beacon does not use browser storage.
                - Cloudflare states that unsampled beacon data is retained for 7 days and then aggregated to about 10% for longer-term storage; dashboard history is available for 6 months. The beacon may be processed in a different country or region from the visitor. The operator must check the actual Cloudflare account, plan, and applicable data processing terms before publication.
  - columns: 2
    cells:
      -
        - type: section
          title: Consent, retention, and transfers
          tone: accent
          blocks:
            - type: text
              paragraphs:
                - The consent choice is stored in first-party localStorage on the visitor's device for the configured period. This site does not send that choice to the operator as a receipt or server-side audit record. A visitor can reopen Privacy settings to change or withdraw it; withdrawal stops an active integration after the page reloads. If the operator relies on consent to process personal data, the operator must ensure it can demonstrate consent as required by GDPR Article 7.
                - Hosting and security log retention depends on the deployed provider account and is not set by this source configuration. Cloudflare's data processing addendum describes transfer safeguards, including standard contractual clauses for restricted transfers; the operator must confirm the applicable agreement and safeguards for this deployment.
            - type: privacy-consent
              storageLabel: Browser storage key
              expiryLabel: Preference expiry
              proposedDateLabel: Notice proposed
              effectiveDateLabel: Notice effective
              expiryText: "{days} days after saving"
      -
        - type: section
          title: Your rights
          blocks:
            - type: text
              paragraphs:
                - Where GDPR applies, you may request access, rectification, erasure, restriction, or object to processing. You may request data portability where the legal conditions apply, and withdraw consent at any time without affecting processing that was lawful before withdrawal.
                - Contact the controller using the details above to exercise a right or ask a question. You may also complain to the competent data protection supervisory authority, including in the EU country where you live, work, or believe an infringement occurred.
                - This site does not configure solely automated decisions that produce legal or similarly significant effects. The operator should update this notice if that changes or if the site adds accounts, forms, or other data uses.
  - columns: 1
    cells:
      -
        - type: section
          title: Legal reference
          blocks:
            - type: link-list
              title: Official documents
              items:
                - label: General Data Protection Regulation (EUR-Lex)
                  url: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
                - label: Cloudflare RUM beacon privacy details
                  url: https://developers.cloudflare.com/speed/observatory/rum-beacon/
                - label: Cloudflare Web Analytics retention and FAQ
                  url: https://developers.cloudflare.com/web-analytics/faq/
                - label: Cloudflare Data Processing Addendum
                  url: https://www.cloudflare.com/cloudflare-customer-dpa/
---
