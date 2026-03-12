const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  devtool: 'source-map',
  devServer: {
    static: './dist',
    hot: true,
    open: true,
    port: 8080,
    compress: true,
    allowedHosts: 'all',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.sgf$/,
        type: 'asset/source',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      title: 'SGF Joseki Explorer',
    }),
  ],
  externals: {
    fs: 'null',
    jschardet: 'null',
    'iconv-lite': 'null',
  },
  resolve: {
    extensions: ['.js'],
  },
};

