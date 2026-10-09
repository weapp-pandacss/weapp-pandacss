import type { MonorepoConfig } from 'repoctl'

export default {
  commands: {
    init: {
      skipReadme: true,
      skipPkgJson: true,
    },
    create: {
      defaultTemplate: 'tsdown',
      renameJson: false,
      templateMap: {
        'weapp-vite-wevu': {
          source: 'templates/wevu',
          target: 'examples/weapp-vite-app',
          label: 'Weapp Vite + Wevu',
          description: 'Vue SFC mini-program example with Panda CSS',
          category: 'app',
          remote: {
            kind: 'npm',
            packageName: 'create-weapp-vite',
            version: '3.0.1',
          },
        },
      },
    },
    deps: {
      groups: [
        {
          name: 'wevu-vue3',
          workspaces: ['examples/weapp-vite-app'],
          dependencies: ['vue'],
          reason: 'Pin the integration fixture to the tested Weapp Vite / Wevu 7.4.0 Vue cohort.',
        },
        {
          name: 'taro-react18',
          workspaces: ['examples/taro-app'],
          dependencies: ['react', 'react-dom', '@types/react', '@types/react-dom'],
          reason: 'Taro 4 supports React 18; the web example uses React 19.',
        },
        {
          name: 'taro-babel7',
          workspaces: ['examples/taro-app', 'examples/taro-app-vue3'],
          dependencies: ['@babel/core', '@babel/runtime'],
          reason: 'Taro webpack5 and its Babel preset require Babel 7.',
        },
        {
          name: 'uni-vue3',
          workspaces: ['examples/uni-app-vue3'],
          dependencies: ['vite', 'vue', '@vue/runtime-core', '@vue/compiler-sfc'],
          reason: 'Uni-app compiler and runtime follow its official Vue 3 release cohort.',
        },
      ],
    },
    clean: {
      autoConfirm: false,
      includePrivate: true,
    },
    upgrade: {
      skipOverwrite: false,
      // Framework-owned Vite/PostCSS cohorts must not inherit global overrides.
      targets: ['.agents', 'eslint.config.js', 'stylelint.config.js', 'vitest.config.ts', 'turbo.json', '.github/workflows/release-intent-auto.yml', '.github/ISSUE_TEMPLATE/config.yml'],
      mergeTargets: false,
    },
  },
  tooling: {
    commitlint: {
      extends: ['@commitlint/config-conventional'],
    },
    eslint: {
      astro: true,
      ignores: ['**/fixtures/**', '**/.weapp-vite/**', '.repoctl/**', 'examples/taro-app-linaria/**'],
      svelte: true,
      vue: true,
    },
    stylelint: {
      ignoreFiles: ['**/fixtures/**', '**/styled-system/**'],
      rules: {
        'media-feature-range-notation': 'prefix',
      },
    },
    lintStaged: {
      repoCommand: 'pnpm exec repo',
    },
    vitest: {
      includeWorkspaceRootConfig: false,
      coverageExclude: ['**/dist/**'],
      coverageSkipFull: false,
      overrides: {
        test: {
          coverage: {
            enabled: true,
            // Measure owned library code, including files no test imports.
            // Framework bundles emitted by mpcore are integration subjects.
            include: ['packages/*/src/**/*.ts'],
            reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
            thresholds: {
              perFile: true,
              statements: 100,
              branches: 100,
              functions: 100,
              lines: 100,
            },
          },
        },
      },
    },
    vitestProject: {
      globals: true,
      testTimeout: 60_000,
    },
  },
} satisfies MonorepoConfig
