const path = require("path");
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: {
        recorder: './frontend/ui/recorder/index.tsx',
        player: './frontend/ui/player/index.tsx',
    },
    resolve: {
        extensions: ['.js', '.ts', '.tsx'],
    },
    module: {
        rules: [
            {
                test: /\.(js|mjs|jsx|ts|tsx)$/,
                loader: require.resolve('babel-loader'),
                options: {
                    presets: [
                        "react-app"
                    ],
                    plugins: [
                       
                    ],
                },
            },
            {
                test: /\.module\.(scss|sass)$/,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: true,
                            modules: {
                                exportLocalsConvention: 'camelCaseOnly',
                            },
                        },
                    },
                    'sass-loader'
                ],
                sideEffects: true,
            },
            {
                test: /\.less$/,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: true,
                        },
                    },
                    {
                        loader: "less-loader",
                        options: {
                            lessOptions: {
                                javascriptEnabled: true
                            }
                        }
                    }
                ],
                sideEffects: true,
            },
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: 'player',
            chunks: ['runtime', 'vendors', 'player'],
            template: path.resolve(__dirname, 'index.html'),
            filename: 'player.html',
            inject: true,
        }),
        new HtmlWebpackPlugin({
            title: 'recorder',
            chunks: ['runtime', 'vendors', 'recorder'],
            template: path.resolve(__dirname, 'index.html'),
            filename: 'index.html',
            inject: true,
        }),
    ]
}
