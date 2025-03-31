const childProcess = require('child_process');

module.exports = {
  hooks: {
    hookName: {
      localCommand: 'command to run on computer',
      remoteCommand: 'command to run on every server'
    },
    // 'post.docker.setup': {
    //   // localCommand: 'npm prune --production',
    //   remoteCommand: 'docker cp mediasoup-worker app:/home/app/mediasoup-worker'
    //   // remoteCommand: 'curl https://github.com/versatica/mediasoup/releases/download/3.12.16/mediasoup-worker-3.12.16-linux-x64.tgz'
    // },
    // 'post.restart': {
    //   remoteCommand: 'docker cp mediasoup-worker app:/home/app/mediasoup-worker'
    // },
    // 'post.reconfig': {
    //   remoteCommand: 'docker cp mediasoup-worker app:/home/app/mediasoup-worker'
    // },
  },

  servers: {
    one: {
      host: '139.180.173.110',
      username: 'root',
      password: '!qH6#ZVsNS)(Gw3s',
    }
  },

  proxy: {
    domains: 'jollyroger.jimsug.com',
    nginxServerConfig: './nginx.config',
    ssl: {
      // Enable let's encrypt to create free certificates.
      // The email is used by Let's Encrypt to notify you when the
      // certificates are close to expiring.
      letsEncryptEmail: 'js@sugrono.com',
      forceSSL: true,
    }
  },

  app: {
    // TODO: change app name and path
    name: 'app',
    path: '../',

    servers: {
      one: {},
    },

    buildOptions: {
      serverOnly: true,
    },

    env: {
      ROOT_URL: 'https://jollyroger.jimsug.com',
      MONGO_URL: 'mongodb://mongodb/meteor',
      MONGO_OPLOG_URL: 'mongodb://mongodb/local',
      // MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD: 'true',
      MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL: "https://github.com/versatica/mediasoup/releases/download",
      // MEDIASOUP_WORKER_BIN: '~/mediasoup-worker',
      MAIL_URL: 'smtp://jollyrogertest:8226DsLU7tc8AmRe@mail.smtp2go.com:587',
      // MAIL_URL: 'smtp://AKIAS252WKWPQ3ZMCG4Q:BEWI151caHlkYee3cvkVkFrBNKZQLAwmkUgwJzm+aopo@email-smtp.ap-southeast-2.amazonaws.com:587',
    },

    docker: {
      image: 'zodern/meteor:root',
      // args: ["-p 51000-65535:51000-65535/udp"],
      // args: ["-p 50000-65535:50000-65535", "--userland-proxy=false"],
      // args: ["--network host", "-d"],
    },

    enableUploadProgressBar: true
  },

  mongo: {
    version: '4.4.12',
    servers: {
      one: {}
    }
  },
};
