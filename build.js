#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_DIR = path.join(__dirname, 'build');
const TEMPLATES_SRC = path.join(__dirname, 'src', 'templates');
const TEMPLATES_DEST = path.join(BUILD_DIR, 'templates');

/**
 * Recursively delete a directory
 */
function deleteDirectory(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      deleteDirectory(filepath);
    } else {
      fs.unlinkSync(filepath);
    }
  }
  
  fs.rmdirSync(dir);
}

/**
 * Recursively copy a directory
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const files = fs.readdirSync(src);
  
  for (const file of files) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  try {
    console.log('🔧 Starting build process...');
    
    // Step 1: Clean build directory
    console.log('📦 Cleaning build directory...');
    deleteDirectory(BUILD_DIR);
    
    // Step 2: Compile TypeScript
    console.log('📝 Compiling TypeScript...');
    execSync('npx tsc --incremental', { stdio: 'inherit' });
    
    // Step 3: Copy templates
    console.log('📋 Copying templates...');
    copyDirectory(TEMPLATES_SRC, TEMPLATES_DEST);
    
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

build();
