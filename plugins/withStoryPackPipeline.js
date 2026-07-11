const {
  withXcodeProject,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const STORYPACK_FILES = [
  'MagicWorld/storypack/MegaCtrDecryptor.swift',
  'MagicWorld/storypack/StoryPackPipeline.swift',
  'MagicWorld/storypack/StoryPackPipeline.m',
];

const BRIDGING_IMPORTS = [
  '#import <React/RCTBridgeModule.h>',
  '#import <React/RCTEventEmitter.h>',
  '#import "SSZipArchive/SSZipArchive.h"',
];

function ensureBridgingHeader(iosRoot) {
  const headerPath = path.join(iosRoot, 'MagicWorld/MagicWorld-Bridging-Header.h');
  if (!fs.existsSync(headerPath)) return;

  let content = fs.readFileSync(headerPath, 'utf8');
  BRIDGING_IMPORTS.forEach((line) => {
    if (!content.includes(line)) {
      content += `\n${line}`;
    }
  });
  fs.writeFileSync(headerPath, content);
}

function addStoryPackSources(project, iosRoot) {
  const target = project.getFirstTarget().uuid;
  const groupKey = project.findPBXGroupKey({ name: 'MagicWorld' })
    || project.findPBXGroupKey({ path: 'MagicWorld' });

  STORYPACK_FILES.forEach((relativePath) => {
    const absPath = path.join(iosRoot, relativePath);
    if (!fs.existsSync(absPath)) return;

    if (project.hasFile(relativePath)) return;

    project.addSourceFile(relativePath, { target }, groupKey);
  });
}

function withStoryPackPipeline(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const templateRoot = path.join(cfg.modRequest.projectRoot, 'native-templates/ios-storypack');

      if (fs.existsSync(templateRoot)) {
        STORYPACK_FILES.forEach((relativePath) => {
          const dest = path.join(iosRoot, relativePath);
          const src = path.join(templateRoot, path.basename(relativePath));
          if (!fs.existsSync(dest) && fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(src, dest);
          }
        });
      }

      ensureBridgingHeader(iosRoot);
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    addStoryPackSources(cfg.modResults, cfg.modRequest.platformProjectRoot);
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(withStoryPackPipeline, 'withStoryPackPipeline');
