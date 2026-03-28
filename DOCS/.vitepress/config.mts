import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Prime Invoice",
  description: "Institutional Trade Finance Infrastructure",
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Introduction', link: '/introduction' },
      { text: 'Protocol', link: '/protocol-logic' }
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/introduction' }
        ]
      },
      {
        text: 'Architecture',
        items: [
          { text: 'Protocol Logic', link: '/protocol-logic' },
          { text: 'Math & Fees', link: '/math-and-fees' }
        ]
      },
      {
        text: 'Legal',
        items: [
          { text: 'Compliance & Safety', link: '/legal-and-compliance' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Nolas-Shadow/prime-invoice' }
    ],
    footer: {
      message: 'Released under the Corporate License.',
      copyright: 'Copyright © 2024 Prime Invoice'
    }
  }
})
