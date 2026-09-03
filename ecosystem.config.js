module.exports = {
  apps: [
    {
      name: "vida-food-caisse",
      script: ".output/server/index.mjs",
      env: {
        PORT: 8080,
        HOST: "0.0.0.0",
      },
    },
  ],
};
