const webpack = require('webpack')
const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

const pagesExternals = [
  'react',
  'react/package.json',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/package.json',
  'react-dom/client',
  'react-dom/server',
  'react-dom/server.browser',
  'react-dom/server.edge',
  'react-server-dom-webpack/client',
  'react-server-dom-webpack/client.edge',
  'react-server-dom-webpack/server.edge',
  'react-server-dom-webpack/server.node',
]

function makeAppAliases(reactChannel = '') {
  const alias = {
    react$: `next/dist/compiled/react${reactChannel}`,
    'react/shared-subset$': `next/dist/compiled/react${reactChannel}/react.shared-subset`,
    'react-dom/server-rendering-stub$': `next/dist/compiled/react-dom${reactChannel}/server-rendering-stub`,
    'react-dom$': `next/dist/compiled/react-dom${reactChannel}/server-rendering-stub`,
    'react/jsx-runtime$': `next/dist/compiled/react${reactChannel}/jsx-runtime`,
    'react/jsx-dev-runtime$': `next/dist/compiled/react${reactChannel}/jsx-dev-runtime`,
    'react-dom/client$': `next/dist/compiled/react-dom${reactChannel}/client`,
    'react-dom/server$': `next/dist/compiled/react-dom${reactChannel}/server`,
    'react-dom/server.edge$': `next/dist/compiled/react-dom${reactChannel}/server.edge`,
    'react-dom/server.browser$': `next/dist/compiled/react-dom${reactChannel}/server.browser`,
    'react-server-dom-webpack/client$': `next/dist/compiled/react-server-dom-webpack${reactChannel}/client`,
    'react-server-dom-webpack/client.edge$': `next/dist/compiled/react-server-dom-webpack${reactChannel}/client.edge`,
    'react-server-dom-webpack/server.edge$': `next/dist/compiled/react-server-dom-webpack${reactChannel}/server.edge`,
    'react-server-dom-webpack/server.node$': `next/dist/compiled/react-server-dom-webpack${reactChannel}/server.node`,
  }

  return alias
}

const appAliases = makeAppAliases()
const appExperimentalAliases = makeAppAliases('-experimental')

const sharedExternals = [
  'styled-jsx',
  'styled-jsx/style',
  '@opentelemetry/api',
  'next/dist/compiled/@next/react-dev-overlay/dist/middleware',
  'next/dist/compiled/@ampproject/toolbox-optimizer',
  'next/dist/compiled/edge-runtime',
  'next/dist/compiled/@edge-runtime/ponyfill',
  'next/dist/compiled/undici',
  'next/dist/compiled/raw-body',
  'next/dist/server/capsize-font-metrics.json',
  'critters',
  'next/dist/compiled/node-html-parser',
  'next/dist/compiled/compression',
  'next/dist/compiled/jsonwebtoken',
  'next/dist/compiled/@opentelemetry/api',
  'next/dist/compiled/@mswjs/interceptors/ClientRequest',
]

const externalsMap = {
  './web/sandbox': 'next/dist/server/web/sandbox',
}

const externalsRegexMap = {
  '(.*)trace/tracer$': 'next/dist/server/lib/trace/tracer',
}

const bundleTypes = {
  app: {
    'app-page': path.join(
      __dirname,
      'dist/esm/server/future/route-modules/app-page/module.js'
    ),
    'app-route': path.join(
      __dirname,
      'dist/esm/server/future/route-modules/app-route/module.js'
    ),
  },
  pages: {
    pages: path.join(
      __dirname,
      'dist/esm/server/future/route-modules/pages/module.js'
    ),
    'pages-api': path.join(
      __dirname,
      'dist/esm/server/future/route-modules/pages-api/module.js'
    ),
  },
  server: {
    server: path.join(__dirname, 'dist/esm/server/next-server.js'),
  },
}

module.exports = ({ dev, turbo, bundleType, experimental }) => {
  const externalHandler = ({ context, request, getResolve }, callback) => {
    ;(async () => {
      if (request.endsWith('.external')) {
        const resolve = getResolve()
        const resolved = await resolve(context, request)
        const relative = path.relative(
          path.join(__dirname, '..'),
          resolved.replace('esm' + path.sep, '')
        )
        callback(null, `commonjs ${relative}`)
      } else {
        const regexMatch = Object.keys(externalsRegexMap).find((regex) =>
          new RegExp(regex).test(request)
        )
        if (regexMatch) {
          return callback(null, 'commonjs ' + externalsRegexMap[regexMatch])
        }
        callback()
      }
    })()
  }

  /** @type {webpack.Configuration} */
  return {
    entry: bundleTypes[bundleType],
    target: 'node',
    mode: 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/next-server'),
      filename: `[name]${turbo ? '-turbo' : ''}${
        experimental ? '-experimental' : ''
      }.runtime.${dev ? 'dev' : 'prod'}.js`,
      libraryTarget: 'commonjs2',
    },
    optimization: {
      moduleIds: 'named',
      minimize: true,
      // splitChunks: {
      //   chunks: 'all',
      // },
      concatenateModules: true,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: {
            format: {
              comments: false,
            },
            compress: {
              passes: 2,
            },
          },
        }),
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        'typeof window': JSON.stringify('undefined'),
        'process.env.NEXT_MINIMAL': JSON.stringify('true'),
        'this.serverOptions.experimentalTestProxy': JSON.stringify(false),
        'this.minimalMode': JSON.stringify(true),
        'this.renderOpts.dev': JSON.stringify(dev),
        'process.env.NODE_ENV': JSON.stringify(
          dev ? 'development' : 'production'
        ),
        'process.env.NEXT_RUNTIME': JSON.stringify('nodejs'),
        ...(!dev ? { 'process.env.TURBOPACK': JSON.stringify(turbo) } : {}),
      }),
      !!process.env.ANALYZE &&
        new BundleAnalyzerPlugin({
          analyzerPort: calculateUniquePort(
            dev,
            turbo,
            experimental,
            bundleType
          ),
          openAnalyzer: false,
        }),
    ].filter(Boolean),
    stats: {
      optimizationBailout: true,
    },
    resolve: {
      alias:
        bundleType === 'app'
          ? experimental
            ? appExperimentalAliases
            : appAliases
          : {},
    },
    module: {
      rules: [
        {
          include: /vendored[\\/]rsc[\\/]entrypoints/,
          resolve: {
            conditionNames: ['react-server', '...'],
            alias: {
              react$: `next/dist/compiled/react${
                experimental ? '-experimental' : ''
              }/react.shared-subset`,
            },
          },
          layer: 'react-server',
        },
        {
          issuerLayer: 'react-server',
          resolve: {
            conditionNames: ['react-server', '...'],
            alias: {
              react$: `next/dist/compiled/react${
                experimental ? '-experimental' : ''
              }/react.shared-subset`,
            },
          },
        },
      ],
    },
    externals: [
      ...sharedExternals,
      ...(bundleType === 'pages' ? pagesExternals : []),
      externalsMap,
      externalHandler,
    ],
    experiments: {
      layers: true,
    },
  }
}

function calculateUniquePort(dev, turbo, experimental, bundleType) {
  const devOffset = dev ? 1000 : 0
  const turboOffset = turbo ? 200 : 0
  const experimentalOffset = experimental ? 40 : 0
  let bundleTypeOffset

  switch (bundleType) {
    case 'app':
      bundleTypeOffset = 1
      break
    case 'pages':
      bundleTypeOffset = 2
      break
    default:
      bundleTypeOffset = 3
  }

  return 8888 + devOffset + turboOffset + experimentalOffset + bundleTypeOffset
}
