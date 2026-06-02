import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '@adasp/latency-test',
  description: 'Web Component for measuring browser round-trip audio latency using MLS, chirp, or Golay signals.',
  base: '/latency-test/',

  head: [
    ['link', { rel: 'icon', href: '/latency-test/favicon.ico' }]
  ],

  themeConfig: {
    logo: '/hi-audio.svg',
    siteTitle: false,

    nav: [
      { text: 'Install', link: '/install' },
      { text: 'API', link: '/api' },
      { text: 'Examples', link: '/examples/vanilla-js' },
      {
        text: 'GitHub',
        link: 'https://github.com/idsinge/latency-test'
      }
    ],

    sidebar: [
      { text: 'Installation & Setup', link: '/install' },
      { text: 'API Reference', link: '/api' },
      {
        text: 'Integration Examples',
        items: [
          { text: '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg" width="16" height="16" style="vertical-align:-2px;margin-right:6px;display:inline;" alt=""> Vanilla JS', link: '/examples/vanilla-js' },
          { text: '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg" width="16" height="16" style="vertical-align:-2px;margin-right:6px;display:inline;" alt=""> React', link: '/examples/react' },
          { text: '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vuejs/vuejs-original.svg" width="16" height="16" style="vertical-align:-2px;margin-right:6px;display:inline;" alt=""> Vue 3', link: '/examples/vue' },
          { text: '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/svelte/svelte-original.svg" width="16" height="16" style="vertical-align:-2px;margin-right:6px;display:inline;" alt=""> Svelte / SvelteKit', link: '/examples/svelte' },
          { text: '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/angular/angular-original.svg" width="16" height="16" style="vertical-align:-2px;margin-right:6px;display:inline;" alt=""> Angular', link: '/examples/angular' },
          { text: '<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg" width="16" height="16" style="vertical-align:-2px;margin-right:6px;display:inline;" alt=""> Next.js', link: '/examples/nextjs' },
          { text: 'Host-Controlled Gain', link: '/examples/host-gain' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/idsinge/latency-test' }
    ],

    footer: {
      message: 'MIT License',
      copyright: 'Copyright © 2024 Hi-Audio'
    },

    search: {
      provider: 'local'
    }
  }
})
