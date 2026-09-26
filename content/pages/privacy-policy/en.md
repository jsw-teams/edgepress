---
title: Privacy policy
lang: en
slug: privacy-policy
description: Current data handling, consent controls, configured integrations, and publication details for this EdgePress site.
blocks:
  - columns: 1
    cells:
      -
        - type: section
          title: Site operator
          tone: soft
          blocks:
            - type: privacy-controller
              nameLabel: Controller
              contactLabel: Privacy contact
              missingTitle: Publication setup required
              missingText: config.yml still needs the site's real operator name and a working privacy contact. Add both before publishing this policy.
  - columns: 2
    cells:
      -
        - type: section
          title: What this starter site does
          blocks:
            - type: text
              paragraphs:
                - This source build contains public pages, posts, search data, a sitemap, and an Atom feed. It does not include a visitor account system, comments, or a contact form.
                - The Worker exposes an optional /api/v1/ proxy for a backend. It forwards requests only when the deployer configures a Service Binding or BACKEND_URL together with the BACKEND_TOKEN secret. This starter site does not submit page content to that API.
                - Hosting and delivery providers may process connection and request data to operate the site. The operator must identify the providers and describe their applicable terms and retention before publication.
      -
        - type: section
          title: Optional browser services
          blocks:
            - type: text
              text: This list is regenerated on each build from enabled browser services in config.yml under plugins.consent. It shows each provider, category, purpose, and retention period.
            - type: privacy-services
              emptyText: No optional third-party browser services are configured in this source build.
  - columns: 1
    cells:
      -
        - type: section
          title: Consent preferences
          tone: accent
          blocks:
            - type: text
              paragraphs:
                - Browser integrations are loaded only after the visitor accepts a configured service. The consent interface stores a first-party preference in local browser storage when a choice can be saved. It is not a server-side audit log.
                - Visitors can reopen Privacy settings to change a choice. If they withdraw a previously active service, the page reloads so that the integration can stop running.
            - type: privacy-consent
              storageLabel: Browser storage key
              expiryLabel: Preference expiry
              versionLabel: Consent configuration version
              expiryText: "{days} days after saving"
  - columns: 1
    cells:
      -
        - type: section
          title: Provider and legal details
          blocks:
            - type: text
              paragraphs:
                - Before enabling a provider, the operator must document the information it receives, purposes, recipients, applicable retention, and any cross-border transfers. Public site identifiers may be configured in the browser; CAPTCHA secret keys must stay on a trusted server, which must verify each response token.
                - This starter configuration cannot determine the operator's jurisdiction, legal bases, retention obligations, or the rights that apply to a particular deployment. Complete this policy for the actual site and seek qualified advice where needed.
                - Review the current privacy information and terms for every provider listed above. Confirm that its actual data collection, recipients, retention, and transfer practices match this policy before publication and whenever the configuration changes.
            - type: link-list
              title: Primary legal references
              items:
                - label: GDPR text on EUR-Lex
                  url: https://eur-lex.europa.eu/eli/reg/2016/679
                - label: UK ICO information notice guidance
                  url: https://ico.org.uk/for-organisations/advice-for-small-organisations/getting-started-with-gdpr/data-protection-self-assessment/what-information-you-must-supply-under-the-gdpr/
                - label: China Personal Information Protection Law
                  url: https://www.miit.gov.cn/jgsj/zfs/fl/art/2022/art_515a4b20c12f430eab54bb4f56d89f56.html
---
