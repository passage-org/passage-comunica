const path = require('path')

module.exports = {
  entry: './src/index.js',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }]
  },
  // this needs to be added to build a library target as ESM
  experiments: {
    outputModule: true
  },
  output: {
    // and also this — which requires the previous block
    libraryTarget: 'module',
    filename: 'passage-comunica-engine.js',
    path: path.resolve(__dirname, 'dist')
  },
    resolveLoader: {
        modules: ['node_modules', path.resolve(__dirname, 'node_modules')],
    },
    
}
