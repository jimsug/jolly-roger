import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import CopyPlugin from "copy-webpack-plugin";
import ZipPlugin from "zip-webpack-plugin";

const srcDir = join(import.meta.dirname, "..", "src");
const distDir = join(import.meta.dirname, "..", "dist");

// build-extension.yml publishes each release, and its update manifests, to the
// repository the workflow runs in, so installed copies must poll that one.
// Local builds point at the team's repository.
const releasesUrl = `https://github.com/${
  process.env.GITHUB_REPOSITORY ?? "Palindrome-Puzzles/jolly-roger"
}/releases/latest/download`;

// Release builds take their version from the tag (v1.2.3 builds 1.2.3), so it
// matches the update manifests build-extension.yml publishes beside them.
// Browsers only take one to four dot-separated integers.
const version =
  process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME.replace(/^v/, "")
    : JSON.parse(
        readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
      ).version;
if (!/^\d+(\.\d+){0,3}$/.test(version)) {
  throw new Error(`${version} isn't a valid extension version`);
}

// Clean the dist directory before every build.
rmSync(distDir, { recursive: true, force: true });

export default ["chrome", "firefox"].map((browser) => {
  return {
    entry: {
      popup: join(srcDir, "popup.tsx"),
      options: join(srcDir, "options.tsx"),
    },
    output: {
      path: join(import.meta.dirname, `../dist/${browser}`),
      filename: "js/[name].js",
    },
    optimization: {
      splitChunks: { name: "vendor", chunks: "all" },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: ".",
            to: ".",
            context: "public",
            transform: {
              transformer(input, absoluteFilename) {
                if (!absoluteFilename.endsWith("manifest.json")) {
                  return input;
                }
                const manifest = JSON.parse(input.toString());
                manifest.version = version;
                if (browser === "firefox") {
                  // Add the update URL for Firefox for self-hosting and auto-updates.
                  manifest.browser_specific_settings = {
                    gecko: {
                      id: "{2bf7bc48-4f7d-4c16-9a88-58bb9f1c6ff5}",
                      strict_min_version: "128.0",
                      update_url: `${releasesUrl}/updates.json`,
                    },
                  };
                } else {
                  // Add the update URL for Chrome for self-hosting and auto-updates.
                  manifest.update_url = `${releasesUrl}/update_manifest.xml`;
                  manifest.minimum_chrome_version = "88";
                }
                return JSON.stringify(manifest);
              },
            },
          },
        ],
        options: {},
      }),
      // This plugin will zip the output directory after the build is complete.
      new ZipPlugin({
        // The path to the directory to be zipped.
        path: join(import.meta.dirname, "..", "dist", browser),
        // The name of the output file, without extension.
        filename: `jolly-roger-${browser}`,
        // The extension for the output file.
        extension: browser === "firefox" ? "xpi" : "zip",
        // The path to the output directory for the zip file.
        // We'll place it in the root `dist` folder.
        destinationPath: join(import.meta.dirname, "..", "dist"),
        // By default, the files in the zip are placed in a directory named after the source.
        // We set pathPrefix to an empty string to have the files at the root of the zip.
        pathPrefix: "",
      }),
    ],
  };
});
