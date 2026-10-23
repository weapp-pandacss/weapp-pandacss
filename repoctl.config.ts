import type { MonorepoConfig } from 'repoctl'

export default {
  commands: {
    release: {
      nightly: {
        provider: 'npm',
        schedule: '0 0 * * *',
      },
      qualityScripts: ['build', 'lint', 'typecheck', 'tsd', 'test'],
    },
    docs: {
      sites: {
        website: {
          packages: ['weapp-pandacss', '@weapp-pandacss/runtime'],
          releaseInputs: {
            'weapp-pandacss': [
              'packages/weapp-pandacss/src/**',
              'packages/weapp-pandacss/package.json',
              'packages/weapp-pandacss/tsdown.config.ts',
              'packages/weapp-pandacss/tsconfig.json',
              'tsconfig.json',
            ],
            '@weapp-pandacss/runtime': [
              'packages/runtime/src/**',
              'packages/runtime/package.json',
              'packages/runtime/tsdown.config.ts',
              'packages/runtime/tsconfig.json',
              'tsconfig.json',
            ],
          },
          buildScript: 'docs:build',
          preview: {
            deployScript: 'docs:deploy:preview',
            url: 'https://preview.panda.weapp.dev',
          },
          stable: {
            deployScript: 'docs:deploy:stable',
            url: 'https://panda.weapp.dev',
          },
          patchPaths: [
            'apps/docs/src/content/docs/**/*.{md,mdx}',
            'apps/docs/public/**/*.{png,jpg,jpeg,webp,svg}',
          ],
        },
      },
    },
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
          name: 'panda-2-1-2-compat',
          workspaces: ['packages/weapp-pandacss'],
          dependencies: ['@pandacss/dev-2-1-2', '@pandacss/preset-base-2-1-2', '@pandacss/preset-panda-2-1-2'],
          sections: ['devDependencies'],
          ignore: true,
          reason: 'Lock Panda 2.1.2 aliases for offline published-consumer compatibility tests; the default cohort is 2.2.0.',
        },
        {
          name: 'wevu-vue3',
          workspaces: ['examples/weapp-vite-app'],
          dependencies: ['vue'],
          reason: 'Pin the integration fixture to the tested Weapp Vite / Wevu 7.5.0 and Vue 3.5.44 cohort.',
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
          dependencies: ['@babel/core', '@babel/preset-react', '@babel/runtime'],
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
      targets: [
        '.agents',
        'eslint.config.js',
        'stylelint.config.js',
        'vitest.config.ts',
        'turbo.json',
        'lefthook.yml',
        '.github/workflows/release.yml',
        '.github/workflows/release-intent-auto.yml',
        '.github/workflows/repoctl-docs.yml',
        '.github/workflows/repoctl-docs-deploy.yml',
        '.github/ISSUE_TEMPLATE/config.yml',
      ],
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
      overrides: [{
        files: ['**/*.less'],
        customSyntax: 'postcss-less',
        extends: ['stylelint-config-standard-less'],
        // repoctl's base preset enables SCSS rules globally. Less uses its own
        // variable and operator grammar, checked by the Less preset instead.
        rules: {
          'scss/at-rule-no-unknown': null,
          'scss/operator-no-newline-after': null,
          'scss/operator-no-newline-before': null,
          'scss/operator-no-unspaced': null,
        },
      }],
      rules: {
        'media-feature-range-notation': 'prefix',
      },
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
