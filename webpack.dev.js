const base = require('./webpack.config');
const {merge} = require('webpack-merge');
module.exports = merge(base, {
    mode: 'development',
    devServer: {
        port: 3111,
        hot: true,
        proxy: {},
        proxy: {},
        historyApiFallback: true,
        open: ['/', '/player.html'],
        
        // Use 'ws' instead of 'sockjs-node' on server since we're using native
        // websockets in `webpackHotDevClient`.
        // transportMode: 'ws',
    },
});
