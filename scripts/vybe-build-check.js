#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-platform build verification script for VYBE extensions
 * Checks that all VYBE contributions compile correctly
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const VYBE_CONTRIBUTIONS = [
	'vybeChat',
	'vybeSettings',
	'indexing'
];

function checkFileExists(filePath, description) {
	if (!existsSync(filePath)) {
		console.error(`❌ ${description} not found: ${filePath}`);
		return false;
	}
	console.log(`✅ ${description}: ${filePath}`);
	return true;
}

function checkImportInMain(contributionName) {
	const mainFile = join(root, 'src', 'vs', 'workbench', 'workbench.common.main.ts');
	if (!existsSync(mainFile)) {
		console.error(`❌ Main file not found: ${mainFile}`);
		return false;
	}

	const content = readFileSync(mainFile, 'utf-8');
	const importPattern = new RegExp(`import.*${contributionName}.*contribution`, 'i');

	if (!importPattern.test(content)) {
		console.error(`❌ ${contributionName} not imported in workbench.common.main.ts`);
		return false;
	}

	console.log(`✅ ${contributionName} imported in workbench.common.main.ts`);
	return true;
}

function checkContributionFile(contributionName) {
	const contributionPath = join(
		root,
		'src',
		'vs',
		'workbench',
		'contrib',
		contributionName,
		'browser',
		contributionName === 'indexing'
			? 'indexing.contribution.ts'
			: contributionName === 'vybeSettings'
			? 'vybeSettings.contribution.ts'
			: 'contribution',
			contributionName === 'vybeChat' ? 'vybeChat.contribution.ts' : ''
	);

	if (contributionName === 'vybeChat') {
		const chatContribution = join(
			root,
			'src',
			'vs',
			'workbench',
			'contrib',
			'vybeChat',
			'browser',
			'contribution',
			'vybeChat.contribution.ts'
		);
		return checkFileExists(chatContribution, `${contributionName} contribution file`);
	} else if (contributionName === 'vybeSettings') {
		const settingsContribution = join(
			root,
			'src',
			'vs',
			'workbench',
			'contrib',
			'vybeSettings',
			'browser',
			'vybeSettings.contribution.ts'
		);
		return checkFileExists(settingsContribution, `${contributionName} contribution file`);
	} else {
		const indexingContribution = join(
			root,
			'src',
			'vs',
			'workbench',
			'contrib',
			'indexing',
			'browser',
			'indexing.contribution.ts'
		);
		return checkFileExists(indexingContribution, `${contributionName} contribution file`);
	}
}

function main() {
	console.log('🔍 Checking VYBE extensions build configuration...\n');

	let allPassed = true;

	// Check Node version
	const nodeVersion = process.version;
	const requiredMajor = 20;
	const actualMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
	if (actualMajor < requiredMajor) {
		console.error(`❌ Node.js version ${nodeVersion} is too old. Required: >=${requiredMajor}.11.0`);
		allPassed = false;
	} else {
		console.log(`✅ Node.js version: ${nodeVersion}`);
	}

	// Check each contribution
	for (const contribution of VYBE_CONTRIBUTIONS) {
		console.log(`\n📦 Checking ${contribution}...`);
		if (!checkContributionFile(contribution)) {
			allPassed = false;
		}
		if (!checkImportInMain(contribution)) {
			allPassed = false;
		}
	}

	// Check package.json
	const packageJson = join(root, 'package.json');
	if (!checkFileExists(packageJson, 'package.json')) {
		allPassed = false;
	} else {
		const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
		if (!pkg.engines || !pkg.engines.node) {
			console.warn('⚠️  package.json missing engines.node field');
		} else {
			console.log(`✅ package.json engines.node: ${pkg.engines.node}`);
		}
	}

	console.log('\n' + '='.repeat(50));
	if (allPassed) {
		console.log('✅ All VYBE extension checks passed!');
		process.exit(0);
	} else {
		console.error('❌ Some checks failed. Please fix the issues above.');
		process.exit(1);
	}
}

main();

