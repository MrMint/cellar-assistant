---
allowed-tools: Bash, Read, Grep, Glob, Write
description: Analyze app performance and generate optimization report
---

Perform a comprehensive performance analysis of the Next.js application:

## Bundle Analysis

1. Check if @next/bundle-analyzer is installed, install if needed
2. Run build with ANALYZE=true to generate bundle analysis
3. Identify large dependencies and opportunities for code splitting

## Core Web Vitals Analysis

1. Check for Web Vitals monitoring setup
2. Analyze current implementation for:
   - Largest Contentful Paint (LCP) issues
   - Cumulative Layout Shift (CLS) problems
   - First Input Delay (FID) / Interaction to Next Paint (INP)

## Code Analysis

1. Find components not using dynamic imports where appropriate
2. Check image optimization (using next/image properly)
3. Verify font optimization (using next/font)
4. Analyze third-party script loading strategies
5. Check for unnecessary client-side data fetching

## Caching Analysis

1. Review fetch caching strategies
2. Check for proper use of revalidate
3. Analyze static vs dynamic rendering choices

## Generate Report

Create a detailed performance report with:

- Current bundle size metrics
- Largest dependencies
- Optimization opportunities ranked by impact
- Specific code changes needed
- Estimated performance improvements

Save the report to `performance-report.md` with actionable recommendations.
