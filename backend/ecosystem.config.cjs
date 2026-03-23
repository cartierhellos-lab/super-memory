module.exports = {
  apps: [{
    name: "massmail-api",
    cwd: "/var/www/massmail/backend",
    script: "dist/index.js",
    node_args: "--inspect=0.0.0.0:9229",
    env: {
      NODE_ENV: "production",
      FRONTEND_DIR: "/var/www/massmail/frontend/dist",
    },
  }],
};
