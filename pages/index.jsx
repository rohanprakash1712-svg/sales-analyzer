import React, { useState } from 'react';

export default function SalesPipelineAnalyzer() {
  const [csvData, setCsvData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const formatCurrency = (num) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num || 0);
  };

  // ============= ADVANCED ANALYTICS ENGINE =============

  // 1. DEAL SCORING ENGINE
  const calculateDealScore = (deal, stageThresholds) => {
    const { stage, days, value, daysInStage } = deal;
    const stageValue = stageThresholds[stage] || 0;

    // Stage health (0-40 points): Earlier stages get higher scores
    const stageScores = {
      'Discovery': 40,
      'Proposal Sent': 30,
      'Negotiation': 20,
      'Closed Won': 40,
      'Closed Lost': 0
    };
    const stageScore = stageScores[stage] || 10;

    // Activity recency (0-30 points): How fresh is this deal?
    const recencyScore = Math.max(0, 30 - (days * 3));

    // Momentum (0-20 points): Is it progressing well through the current stage?
    const momentumScore = Math.max(0, 20 - (daysInStage / stageValue) * 20);

    // Deal size impact (0-10 points): Larger deals matter more
    const valueFactor = Math.min(10, (value / 100000) * 10);

    const totalScore = stageScore + recencyScore + momentumScore + valueFactor;
    return Math.min(100, Math.round(totalScore));
  };

  // 2. WIN PROBABILITY PREDICTOR
  const calculateWinProbability = (deal, stageThresholds) => {
    const { stage, days, daysInStage } = deal;
    const stageValue = stageThresholds[stage] || 0;

    // Base probability by stage
    const stageProbabilities = {
      'Discovery': 0.15,
      'Proposal Sent': 0.35,
      'Negotiation': 0.65,
      'Closed Won': 1.0,
      'Closed Lost': 0.0
    };

    let baseProbability = stageProbabilities[stage] || 0.1;

    // Adjust based on velocity (days in stage vs threshold)
    const velocityRatio = daysInStage / stageValue;
    if (velocityRatio > 2) {
      baseProbability *= 0.6; // Slow deals less likely
    } else if (velocityRatio < 0.5) {
      baseProbability *= 1.2; // Fast deals more likely
    }

    // Adjust based on overall inactivity
    if (days > 7) {
      baseProbability *= 0.7;
    } else if (days > 14) {
      baseProbability *= 0.4;
    }

    return Math.min(100, Math.max(0, Math.round(baseProbability * 100)));
  };

  // 3. PREDICTED CLOSE DATE
  const predictCloseDate = (deal, stageThresholds, allDealsInStage) => {
    const { stage, daysInStage } = deal;
    const stageThreshold = stageThresholds[stage] || 7;

    // Calculate average time to close for this stage from similar deals
    const avgDaysInStage = allDealsInStage.length > 0
      ? allDealsInStage.reduce((sum, d) => sum + d.daysInStage, 0) / allDealsInStage.length
      : stageThreshold;

    const remainingDays = Math.max(0, avgDaysInStage - daysInStage);
    const predictedDate = new Date();
    predictedDate.setDate(predictedDate.getDate() + remainingDays);

    return predictedDate;
  };

  // 4. OWNER PERFORMANCE METRICS
  const calculateOwnerMetrics = (parsed, stageThresholds) => {
    const ownerData = {};

    parsed.forEach(deal => {
      if (!ownerData[deal.owner]) {
        ownerData[deal.owner] = {
          name: deal.owner,
          deals: [],
          totalValue: 0,
          closedWonValue: 0,
          closedWonCount: 0
        };
      }

      ownerData[deal.owner].deals.push(deal);
      ownerData[deal.owner].totalValue += deal.value;

      if (deal.stage === 'Closed Won') {
        ownerData[deal.owner].closedWonValue += deal.value;
        ownerData[deal.owner].closedWonCount += 1;
      }
    });

    // Calculate metrics for each owner
    const metrics = Object.values(ownerData).map(owner => {
      const closingRate = owner.deals.length > 0
        ? (owner.closedWonCount / owner.deals.length) * 100
        : 0;

      const avgDealValue = owner.deals.length > 0
        ? owner.totalValue / owner.deals.length
        : 0;

      const avgDaysInPipeline = owner.deals.length > 0
        ? owner.deals.reduce((sum, d) => sum + d.days, 0) / owner.deals.length
        : 0;

      // Velocity score: Deals moved per week
      // Formula: (Open deals + Closed deals) / (avg days in pipeline / 7)
      // If avg is 14 days with 10 deals, that's 10 deals per 2 weeks = 5 deals/week = 50 score
      const dealsPerWeek = owner.deals.length > 0
        ? (owner.deals.length / Math.max(1, avgDaysInPipeline)) * 7
        : 0;

      // Scale to 0-100: 1 deal/week = 50, 2+ deals/week = 100, <0.5 = low
      const velocityScore = Math.min(100, Math.round((dealsPerWeek / 2) * 100));

      // Pipeline health for this owner
      const pipelineHealth = (closingRate * 0.4) + (velocityScore * 0.6);

      return {
        name: owner.name,
        dealCount: owner.deals.length,
        totalValue: owner.totalValue,
        closedWonValue: owner.closedWonValue,
        closingRate: Math.round(closingRate),
        avgDealValue: Math.round(avgDealValue),
        avgDaysInPipeline: Math.round(avgDaysInPipeline),
        dealsPerWeek: dealsPerWeek.toFixed(2),
        velocityScore: Math.round(velocityScore),
        pipelineHealth: Math.round(pipelineHealth),
        riskDeals: owner.deals.filter(d => d.days > 7).length
      };
    });

    return metrics.sort((a, b) => b.pipelineHealth - a.pipelineHealth);
  };

  // 5. STAGE PROGRESSION & BOTTLENECK ANALYSIS
  const analyzeStageProgression = (parsed) => {
    const stages = ['Discovery', 'Proposal Sent', 'Negotiation', 'Closed Won'];
    const stageAnalysis = {};

    stages.forEach(stage => {
      const dealsInStage = parsed.filter(d => d.stage === stage);
      if (dealsInStage.length === 0) {
        stageAnalysis[stage] = {
          stage,
          dealCount: 0,
          totalValue: 0,
          avgDaysInStage: 0,
          isBottleneck: false,
          riskPercentage: 0
        };
        return;
      }

      const totalValue = dealsInStage.reduce((sum, d) => sum + d.value, 0);
      const avgDaysInStage = dealsInStage.reduce((sum, d) => sum + d.daysInStage, 0) / dealsInStage.length;
      const riskCount = dealsInStage.filter(d => d.days > 7).length;
      const riskPercentage = (riskCount / dealsInStage.length) * 100;

      // Bottleneck detection: Stage with highest deal accumulation + slowest progression
      const isBottleneck = avgDaysInStage > 10 && dealsInStage.length > 2;

      stageAnalysis[stage] = {
        stage,
        dealCount: dealsInStage.length,
        totalValue,
        avgDaysInStage: Math.round(avgDaysInStage),
        isBottleneck,
        riskPercentage: Math.round(riskPercentage),
        deals: dealsInStage
      };
    });

    return stageAnalysis;
  };

  // 6. REVENUE AT RISK CALCULATION
  const calculateRevenueAtRisk = (parsed, stageThresholds) => {
    let criticalRisk = 0; // >14 days inactive
    let highRisk = 0; // 7-14 days
    let mediumRisk = 0; // 3-7 days

    parsed.forEach(deal => {
      if (deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost') {
        if (deal.days > 14) {
          criticalRisk += deal.value;
        } else if (deal.days > 7) {
          highRisk += deal.value;
        } else if (deal.days > 3) {
          mediumRisk += deal.value;
        }
      }
    });

    return { criticalRisk, highRisk, mediumRisk, total: criticalRisk + highRisk + mediumRisk };
  };

  // 7. RECOMMENDED ACTIONS ENGINE
  const generateRecommendedActions = (parsed, ownerMetrics, stageProgression, revenueAtRisk) => {
    const actions = [];

    // Rule 1: Critical urgency - Deals >14 days inactive with high value
    const criticalDeals = parsed.filter(d => d.days > 14 && d.value > 30000 && d.stage !== 'Closed Won');
    criticalDeals.slice(0, 3).forEach(deal => {
      actions.push({
        priority: 'critical',
        action: `Call ${deal.company} immediately`,
        reason: `Deal worth ${formatCurrency(deal.value)} inactive for ${deal.days} days in ${deal.stage}`,
        impact: `₹${deal.value}`,
        owner: deal.owner
      });
    });

    // Rule 2: High-value deals at risk (7-14 days)
    const highValueAtRisk = parsed.filter(d => d.days > 7 && d.days <= 14 && d.value > 50000).sort((a, b) => b.value - a.value);
    highValueAtRisk.slice(0, 2).forEach(deal => {
      actions.push({
        priority: 'high',
        action: `Schedule meeting with ${deal.company}`,
        reason: `₹${deal.value} deal stalling in ${deal.stage} - ${deal.days} days no activity`,
        impact: `₹${deal.value}`,
        owner: deal.owner
      });
    });

    // Rule 3: Bottleneck clearing
    Object.values(stageProgression).forEach(stage => {
      if (stage.isBottleneck && stage.dealCount > 0) {
        actions.push({
          priority: 'high',
          action: `Unblock ${stage.stage} stage (${stage.dealCount} deals)`,
          reason: `${stage.dealCount} deals stuck for avg ${stage.avgDaysInStage} days - process issue`,
          impact: `${formatCurrency(stage.totalValue)} in pipeline`,
          owner: 'Team'
        });
      }
    });

    // Rule 4: Rep coaching - Low velocity
    ownerMetrics.forEach(rep => {
      if (rep.velocityScore < 40 && rep.dealCount > 2) {
        actions.push({
          priority: 'medium',
          action: `Coach ${rep.name} on deal progression`,
          reason: `Velocity score ${rep.velocityScore}/100 - deals moving slowly (${rep.dealsPerWeek} deals/week)`,
          impact: `${rep.dealCount} deals at risk of stalling`,
          owner: rep.name
        });
      }
    });

    // Rule 5: Rep coaching - Low closing rate
    ownerMetrics.forEach(rep => {
      if (rep.closingRate < 30 && rep.dealCount > 3) {
        actions.push({
          priority: 'medium',
          action: `Review ${rep.name}'s negotiation playbook`,
          reason: `Closing rate ${rep.closingRate}% (team should be 40%+) - losing deals at finish line`,
          impact: `Avg deal value: ${formatCurrency(rep.avgDealValue)}`,
          owner: rep.name
        });
      }
    });

    // Rule 6: Early-stage deals with momentum - prioritize for closing
    const winningDeals = parsed.filter(d =>
      (d.stage === 'Proposal Sent' || d.stage === 'Negotiation') &&
      d.days <= 5 &&
      d.winProbability > 60 &&
      d.value > 20000
    ).sort((a, b) => b.value - a.value);

    if (winningDeals.length > 0) {
      actions.push({
        priority: 'high',
        action: `Prioritize closing: ${winningDeals.map(d => d.company).join(', ')}`,
        reason: `${winningDeals.length} deals with 60%+ win probability and fresh activity`,
        impact: `₹${winningDeals.reduce((s, d) => s + d.value, 0)} revenue opportunity`,
        owner: winningDeals[0].owner
      });
    }

    // Rule 7: Discovery deals - push to Proposal if >5 days
    const stalledDiscovery = parsed.filter(d => d.stage === 'Discovery' && d.days > 5);
    if (stalledDiscovery.length > 0) {
      actions.push({
        priority: 'medium',
        action: `Move ${stalledDiscovery.length} deals from Discovery to Proposal`,
        reason: `${stalledDiscovery.length} deals stuck in Discovery >5 days - need to progress`,
        impact: `₹${stalledDiscovery.reduce((s, d) => s + d.value, 0)} in early stage`,
        owner: 'Team'
      });
    }

    // Rule 8: Win celebration / deal closing tracking
    const justClosed = parsed.filter(d => d.stage === 'Closed Won' && d.daysInStage <= 3);
    if (justClosed.length > 0) {
      actions.push({
        priority: 'info',
        action: `Document wins: ${justClosed.map(d => d.company).join(', ')}`,
        reason: `${justClosed.length} recently closed - capture learnings for future deals`,
        impact: `Process improvement`,
        owner: justClosed[0].owner
      });
    }

    // Sort by priority (critical > high > medium > info) then by impact
    const priorityOrder = { critical: 0, high: 1, medium: 2, info: 3 };
    return actions.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return 0;
    }).slice(0, 10); // Limit to top 10 actionable items
  };

  const downloadSampleCSV = () => {
    const sample = `Company,Deal Value,Stage,Last Activity Date,Owner,Days In Stage
Acme Corp,125000,Negotiation,2026-03-28,Rohan,18
TechStart Inc,85000,Proposal Sent,2026-03-25,Amit,21
GlobalTech Solutions,220000,Negotiation,2026-03-22,Rohan,25
BlueSky Digital,45000,Discovery,2026-04-02,Sneha,13
CloudNine Systems,95000,Proposal Sent,2026-04-08,Amit,7
Enterprise Hub,180000,Negotiation,2026-04-10,Rohan,3
DataFlow Analytics,65000,Discovery,2026-03-20,Sneha,26
Innovation Labs,150000,Proposal Sent,2026-04-05,Amit,10
Premium Services,55000,Discovery,2026-04-12,Sneha,3
NextGen Corp,200000,Negotiation,2026-04-13,Rohan,1
Swift Solutions,75000,Proposal Sent,2026-03-18,Amit,24
Velocity Partners,110000,Discovery,2026-04-06,Sneha,9
Quantum Leap,320000,Negotiation,2026-04-11,Rohan,2
ProFlow Inc,45000,Proposal Sent,2026-03-30,Amit,15
StreamBase Tech,190000,Discovery,2026-04-09,Sneha,6
Horizon Systems,80000,Proposal Sent,2026-04-01,Amit,14
Nexus Digital,135000,Negotiation,2026-04-12,Rohan,1
Maven Solutions,55000,Discovery,2026-04-04,Sneha,11
OptiMax Corp,165000,Proposal Sent,2026-03-29,Amit,16
Catalyst Industries,275000,Negotiation,2026-04-14,Rohan,0
Silver Lining,40000,Discovery,2026-04-10,Sneha,5
ElevateAI,125000,Proposal Sent,2026-04-07,Amit,8
Powerhouse Tech,95000,Negotiation,2026-03-31,Rohan,14
Insight Partners,70000,Discovery,2026-03-15,Sneha,31
FutureScale Inc,210000,Negotiation,2026-04-09,Rohan,6
MetaVerse Corp,60000,Proposal Sent,2026-03-27,Amit,19
ValueStream,85000,Discovery,2026-04-08,Sneha,7
Pinnacle Solutions,175000,Negotiation,2026-04-11,Rohan,3
FastTrack Systems,50000,Proposal Sent,2026-04-03,Amit,12
Nexus Prime,240000,Discovery,2026-04-13,Sneha,1
SynergyTech,105000,Negotiation,2026-04-01,Rohan,13
CloudPeak Analytics,65000,Proposal Sent,2026-03-26,Amit,20
Momentum Inc,145000,Discovery,2026-04-11,Sneha,3
VisionaryAI,320000,Negotiation,2026-04-08,Rohan,6
Apex Digital,90000,Proposal Sent,2026-04-12,Amit,3
Zenith Partners,180000,Discovery,2026-04-09,Sneha,5
Quantum Systems,70000,Negotiation,2026-03-19,Rohan,26
Velocity Pro,115000,Proposal Sent,2026-03-24,Amit,22
SolidState Corp,200000,Negotiation,2026-04-14,Rohan,0
Innovate Hub,55000,Discovery,2026-04-05,Sneha,10
Elite Partners,250000,Proposal Sent,2026-04-02,Amit,13
Spectrum Tech,85000,Negotiation,2026-04-07,Rohan,7
Ascend Digital,140000,Discovery,2026-04-10,Sneha,5
Phoenix Solutions,95000,Proposal Sent,2026-04-06,Amit,9
Orbital Systems,310000,Negotiation,2026-04-12,Rohan,2
Cascade Technologies,65000,Discovery,2026-03-28,Sneha,18
Summit Digital,175000,Proposal Sent,2026-04-04,Amit,11
Nexus Crown,120000,Negotiation,2026-04-01,Rohan,13
Vector Innovations,80000,Discovery,2026-04-11,Sneha,4
Prism Partners,230000,Proposal Sent,2026-04-09,Amit,6`;

    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_pipeline_demo.csv';
    a.click();
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCsvData(e.target.result);
      setReport(null);
      setError(null);
    };
    reader.readAsText(file);
  };

  const getWhy = (d) => {
    if (d.stage === 'Negotiation' && d.days > 1)
      return 'Late-stage deal cooling off — high risk';
    if (d.stage === 'Proposal Sent' && d.days > 2)
      return 'Proposal not progressing — needs push';
    if (d.stage === 'Discovery' && d.days > 3)
      return 'Early-stage drift — may lose interest';
    if (d.days > 7)
      return 'Deal likely lost momentum';
    return 'Needs follow-up';
  };

  const analyzeCSV = async () => {
    if (!csvData) return setError('Upload CSV first');

    setLoading(true);
    setError(null);

    try {
      const lines = csvData.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      const deals = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i] || '');
        return obj;
      });

      const today = new Date();

      const stageThreshold = {
        'Negotiation': 3,
        'Proposal Sent': 5,
        'Discovery': 7,
        'Closed Won': 1,
        'Closed Lost': 1
      };

      const parsed = deals.map(d => {
        const lastDate = new Date(d['Last Activity Date']);
        const days = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        const daysInStage = parseInt(d['Days In Stage']) || Math.floor(Math.random() * 20 + 1);

        return {
          company: d.Company,
          value: parseInt(d['Deal Value']) || 0,
          stage: d.Stage,
          owner: d.Owner || 'Unassigned',
          days,
          daysInStage,
          dealScore: 0, // Will be calculated
          winProbability: 0 // Will be calculated
        };
      });

      // Calculate advanced metrics for each deal
      parsed.forEach(deal => {
        deal.dealScore = calculateDealScore(deal, stageThreshold);
        deal.winProbability = calculateWinProbability(deal, stageThreshold);
      });

      // Basic risk analysis
      const atRisk = parsed.filter(d => d.days > (stageThreshold[d.stage] || 0));
      const leaks = parsed.filter(d => d.days > 7);
      const highProb = parsed.filter(d =>
        d.days <= 3 && (d.stage === 'Negotiation' || d.stage === 'Proposal Sent')
      );

      const topRisk = [...atRisk]
        .sort((a, b) => a.dealScore - b.dealScore)
        .slice(0, 5);

      const topLeaks = [...leaks]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

      const topHigh = [...highProb]
        .sort((a, b) => b.dealScore - a.dealScore)
        .slice(0, 3);

      // Advanced analytics
      const ownerMetrics = calculateOwnerMetrics(parsed, stageThreshold);
      const stageProgression = analyzeStageProgression(parsed);
      const revenueAtRisk = calculateRevenueAtRisk(parsed, stageThreshold);
      const recommendedActions = generateRecommendedActions(parsed, ownerMetrics, stageProgression, revenueAtRisk);

      // Top opportunities (high-probability, high-value deals)
      const topOpportunities = [...parsed]
        .filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
        .sort((a, b) => (b.dealScore * b.value) - (a.dealScore * a.value))
        .slice(0, 5);

      const sum = arr => arr.reduce((s, d) => s + d.value, 0);
      const totalValue = sum(parsed);

      const score = Math.max(
        0,
        Math.min(100, Math.round(100 - (revenueAtRisk.total / (totalValue || 1)) * 60))
      );

      const scoreExplanation =
        score > 75
          ? 'Strong pipeline with healthy deal movement'
          : score > 50
          ? 'Moderate pipeline risk, needs attention'
          : 'Weak pipeline, high inactivity and leakage';

      setAiLoading(true);
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysis: {
              totalDeals: parsed.length,
              riskValue: revenueAtRisk.total,
              score,
              avgDealScore: Math.round(parsed.reduce((s, d) => s + d.dealScore, 0) / parsed.length),
              avgWinProbability: Math.round(parsed.reduce((s, d) => s + d.winProbability, 0) / parsed.length)
            }
          })
        });
        const data = await response.json();
        setAiSummary(data?.summary || 'AI insights unavailable');
      } catch {
        setAiSummary('AI insights unavailable');
      }
      setAiLoading(false);

      setReport({
        score,
        scoreExplanation,
        totalDeals: parsed.length,
        totalValue,
        revenueAtRisk,
        topRisk,
        topLeaks,
        topHigh,
        topOpportunities,
        ownerMetrics,
        stageProgression,
        recommendedActions,
        parsed
      });
    } catch (err) {
      setError('Error analyzing CSV: ' + err.message);
    }

    setLoading(false);
  };

  const RiskCard = ({ company, days, value, why, variant = 'default', dealScore, winProb }) => {
    const getBgColor = () => {
      if (variant === 'critical') return '#fee2e2';
      if (variant === 'warning') return '#fef3c7';
      if (variant === 'success') return '#dbeafe';
      return '#f3f4f6';
    };

    const getTextColor = () => {
      if (variant === 'critical') return '#7f1d1d';
      if (variant === 'warning') return '#78350f';
      if (variant === 'success') return '#082f49';
      return '#374151';
    };

    const getBorderColor = () => {
      if (variant === 'critical') return '#fecaca';
      if (variant === 'warning') return '#fcd34d';
      if (variant === 'success') return '#93c5fd';
      return '#e5e7eb';
    };

    return (
      <div style={{
        background: getBgColor(),
        border: `1px solid ${getBorderColor()}`,
        borderRadius: 12,
        padding: '16px',
        marginBottom: '12px',
        transition: 'all 0.3s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: '12px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '15px',
              fontWeight: '600',
              color: getTextColor(),
              marginBottom: '4px'
            }}>
              {company}
            </div>
            <div style={{
              fontSize: '13px',
              color: getTextColor(),
              opacity: 0.75,
              marginBottom: '6px'
            }}>
              {days} days inactive • {formatCurrency(value)}
            </div>
            <div style={{
              display: 'flex',
              gap: '16px',
              marginBottom: '6px',
              fontSize: '12px'
            }}>
              <span style={{ color: getTextColor(), opacity: 0.7 }}>
                Deal Score: <strong>{dealScore}</strong>
              </span>
              <span style={{ color: getTextColor(), opacity: 0.7 }}>
                Win Prob: <strong>{winProb}%</strong>
              </span>
            </div>
            <div style={{
              fontSize: '12px',
              color: getTextColor(),
              opacity: 0.65,
              lineHeight: '1.5'
            }}>
              {why}
            </div>
          </div>
          <div style={{
            fontSize: '20px',
            opacity: 0.5
          }}>
            {variant === 'critical' ? '🔴' : variant === 'warning' ? '🟡' : variant === 'success' ? '🟢' : '○'}
          </div>
        </div>
      </div>
    );
  };

  const StatCard = ({ label, value, unit = '', variant = 'default' }) => {
    const getBgColor = () => {
      if (variant === 'critical') return '#fef2f2';
      if (variant === 'success') return '#f0fdf4';
      if (variant === 'warning') return '#fffbeb';
      return '#f9fafb';
    };

    const getValueColor = () => {
      if (variant === 'critical') return '#dc2626';
      if (variant === 'success') return '#16a34a';
      if (variant === 'warning') return '#d97706';
      return '#374151';
    };

    return (
      <div style={{
        background: getBgColor(),
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '13px',
          color: '#6b7280',
          fontWeight: '500',
          marginBottom: '8px',
          letterSpacing: '0.5px'
        }}>
          {label}
        </div>
        <div style={{
          fontSize: '32px',
          fontWeight: '700',
          color: getValueColor(),
          lineHeight: 1
        }}>
          {value}
        </div>
        {unit && (
          <div style={{
            fontSize: '12px',
            color: '#9ca3af',
            marginTop: '4px'
          }}>
            {unit}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      color: '#1f2937',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%)',
        borderBottom: '1px solid #e5e7eb',
        padding: '60px 20px'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{
            fontSize: '36px',
            fontWeight: '700',
            margin: '0 0 8px 0',
            color: '#111827',
            letterSpacing: '-0.5px'
          }}>
            Sales Pipeline AI
          </h1>
          <p style={{
            fontSize: '16px',
            color: '#6b7280',
            margin: 0,
            fontWeight: '400'
          }}>
            Advanced analytics. Deal scoring. Predictive insights.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>

        {/* Upload Section */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '40px'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            margin: '0 0 20px 0',
            color: '#111827'
          }}>
            Upload your CRM data
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 20px',
              background: '#f9fafb',
              border: '2px dashed #d1d5db',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#9ca3af';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f9fafb';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}>
              📁 {fileName ? `Selected: ${fileName}` : 'Upload CSV'}
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            <button
              onClick={downloadSampleCSV}
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                color: '#374151',
                fontWeight: '500',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e5e7eb';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.transform = 'scale(1)';
              }}>
              ⬇️ Download Sample
            </button>

            <button
              onClick={analyzeCSV}
              disabled={!csvData || loading}
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                background: csvData ? '#3b82f6' : '#d1d5db',
                border: 'none',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                cursor: csvData ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (csvData) {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 10px 24px rgba(59, 130, 246, 0.2)';
                }
              }}
              onMouseLeave={(e) => {
                if (csvData) {
                  e.currentTarget.style.background = '#3b82f6';
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}>
              {loading ? '⏳ Analyzing...' : '🚀 Advanced Analysis'}
            </button>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
            CSV should contain: Company, Deal Value, Stage, Last Activity Date, Owner, Days In Stage
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '40px',
            color: '#7f1d1d',
            fontSize: '14px'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Report */}
        {report && (
          <div style={{ display: 'grid', gap: '40px' }}>

            {/* Score Section */}
            <div style={{
              background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)',
              border: '1px solid #e0f2fe',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500', margin: '0 0 16px 0', letterSpacing: '0.5px' }}>
                PIPELINE HEALTH SCORE
              </p>
              <div style={{
                fontSize: '64px',
                fontWeight: '700',
                color: report.score > 75 ? '#16a34a' : report.score > 50 ? '#d97706' : '#dc2626',
                margin: '0 0 16px 0'
              }}>
                {report.score}
              </div>
              <p style={{ fontSize: '16px', color: '#374151', margin: '0 0 12px 0', fontWeight: '500' }}>
                {report.scoreExplanation}
              </p>
              <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                {formatCurrency(report.revenueAtRisk.total)} at risk
              </p>
            </div>

            {/* Revenue at Risk Breakdown */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              padding: '24px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                margin: '0 0 16px 0',
                color: '#111827'
              }}>
                💰 Revenue at Risk Breakdown
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '16px', background: '#fee2e2', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#7f1d1d', fontWeight: '600', marginBottom: '8px' }}>Critical Risk</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626' }}>{formatCurrency(report.revenueAtRisk.criticalRisk)}</div>
                  <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '4px' }}>{'>'} 14 days</div>
                </div>
                <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#78350f', fontWeight: '600', marginBottom: '8px' }}>High Risk</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#d97706' }}>{formatCurrency(report.revenueAtRisk.highRisk)}</div>
                  <div style={{ fontSize: '11px', color: '#78350f', marginTop: '4px' }}>7-14 days</div>
                </div>
                <div style={{ padding: '16px', background: '#dbeafe', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#082f49', fontWeight: '600', marginBottom: '8px' }}>Medium Risk</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#0284c7' }}>{formatCurrency(report.revenueAtRisk.mediumRisk)}</div>
                  <div style={{ fontSize: '11px', color: '#082f49', marginTop: '4px' }}>3-7 days</div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '16px'
            }}>
              <StatCard label="Total Deals" value={report.totalDeals} variant="default" />
              <StatCard label="Pipeline Value" value={formatCurrency(report.totalValue)} variant="success" />
              <StatCard label="Top Risks" value={report.topRisk.length} variant="critical" />
              <StatCard label="High Probability" value={report.topHigh.length} variant="success" />
            </div>

            {/* Main Content Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '24px'
            }}>

              {/* Left Column */}
              <div style={{ display: 'grid', gap: '24px' }}>

                {/* Top Opportunities */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    margin: '0 0 16px 0',
                    color: '#111827'
                  }}>
                    ⭐ High-Value Opportunities
                  </h3>
                  {report.topOpportunities.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No opportunities</p>
                  ) : (
                    report.topOpportunities.map((d, i) => (
                      <RiskCard key={i} company={d.company} days={d.days} value={d.value} why={getWhy(d)} variant="success" dealScore={d.dealScore} winProb={d.winProbability} />
                    ))
                  )}
                </div>

                {/* Top Risks */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    margin: '0 0 16px 0',
                    color: '#111827'
                  }}>
                    🔴 Top Deals at Risk
                  </h3>
                  {report.topRisk.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No deals at risk</p>
                  ) : (
                    report.topRisk.map((d, i) => (
                      <RiskCard key={i} company={d.company} days={d.days} value={d.value} why={getWhy(d)} variant="critical" dealScore={d.dealScore} winProb={d.winProbability} />
                    ))
                  )}
                </div>

              </div>

              {/* Right Column */}
              <div style={{ display: 'grid', gap: '24px', gridTemplateRows: 'auto auto auto' }}>

                {/* Top Sales Rep */}
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #dcfce7',
                  borderRadius: '16px',
                  padding: '20px'
                }}>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    margin: '0 0 12px 0',
                    color: '#111827'
                  }}>
                    👤 Top Sales Rep
                  </h3>
                  {report.ownerMetrics.length > 0 ? (
                    <div>
                      <div style={{ fontWeight: '600', color: '#16a34a', marginBottom: '8px' }}>
                        {report.ownerMetrics[0].name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#4b5563', lineHeight: '1.6' }}>
                        <div>Close Rate: <strong>{report.ownerMetrics[0].closingRate}%</strong></div>
                        <div>Velocity: <strong>{report.ownerMetrics[0].velocityScore}/100</strong></div>
                        <div>Pipeline Health: <strong>{report.ownerMetrics[0].pipelineHealth}/100</strong></div>
                      </div>
                    </div>
                  ) : (
                    <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>No data available</p>
                  )}
                </div>

                {/* Stage Bottlenecks */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '20px'
                }}>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    margin: '0 0 12px 0',
                    color: '#111827'
                  }}>
                    🚦 Stage Bottlenecks
                  </h3>
                  {Object.values(report.stageProgression).some(s => s.isBottleneck) ? (
                    <div style={{ fontSize: '12px' }}>
                      {Object.values(report.stageProgression).filter(s => s.isBottleneck).map((stage, i) => (
                        <div key={i} style={{ padding: '8px', background: '#fef3c7', borderRadius: '6px', marginBottom: '8px', color: '#78350f' }}>
                          <strong>{stage.stage}</strong>: {stage.dealCount} deals, {stage.avgDaysInStage}d avg
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>No bottlenecks detected</p>
                  )}
                </div>

                {/* AI Insights */}
                <div style={{
                  background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '20px'
                }}>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    margin: '0 0 12px 0',
                    color: '#111827'
                  }}>
                    ✨ AI Insights
                  </h3>
                  {aiLoading ? (
                    <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Analyzing...</p>
                  ) : aiSummary === 'AI insights unavailable' ? (
                    <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Ready to provide deeper insights</p>
                  ) : (
                    <div>
                      {aiSummary.split('\n').map((line, i) => (
                        line.trim() && (
                          <p key={i} style={{ fontSize: '12px', color: '#374151', margin: '8px 0', lineHeight: '1.4' }}>
                            {line}
                          </p>
                        )
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* Recommended Actions */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              padding: '24px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                margin: '0 0 16px 0',
                color: '#111827'
              }}>
                ✨ Recommended Actions
              </h3>
              {report.recommendedActions.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No urgent actions required</p>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {report.recommendedActions.map((action, i) => {
                    const getBgColor = () => {
                      if (action.priority === 'critical') return '#fee2e2';
                      if (action.priority === 'high') return '#fef3c7';
                      if (action.priority === 'medium') return '#e0f2fe';
                      return '#f3f4f6';
                    };

                    const getBorderColor = () => {
                      if (action.priority === 'critical') return '#fecaca';
                      if (action.priority === 'high') return '#fcd34d';
                      if (action.priority === 'medium') return '#93c5fd';
                      return '#d1d5db';
                    };

                    const getIcon = () => {
                      if (action.priority === 'critical') return '🔴';
                      if (action.priority === 'high') return '🟡';
                      if (action.priority === 'medium') return '🔵';
                      return 'ℹ️';
                    };

                    return (
                      <div key={i} style={{
                        background: getBgColor(),
                        border: `1px solid ${getBorderColor()}`,
                        borderRadius: '12px',
                        padding: '16px',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateX(4px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateX(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                          <div style={{ fontSize: '18px', marginTop: '2px', minWidth: '20px' }}>
                            {getIcon()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#111827',
                              marginBottom: '4px'
                            }}>
                              {action.action}
                            </div>
                            <div style={{
                              fontSize: '13px',
                              color: '#4b5563',
                              marginBottom: '6px'
                            }}>
                              {action.reason}
                            </div>
                            <div style={{
                              display: 'flex',
                              gap: '16px',
                              fontSize: '12px',
                              color: '#6b7280'
                            }}>
                              <span><strong>Impact:</strong> {action.impact}</span>
                              <span><strong>Owner:</strong> {action.owner}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sales Rep Performance Table */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              padding: '24px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                margin: '0 0 16px 0',
                color: '#111827'
              }}>
                📊 Sales Rep Performance
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '13px'
                }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#374151' }}>Rep</th>
                      <th style={{ textAlign: 'center', padding: '12px', fontWeight: '600', color: '#374151' }}>Deals</th>
                      <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#374151' }}>Total Value</th>
                      <th style={{ textAlign: 'center', padding: '12px', fontWeight: '600', color: '#374151' }}>Close Rate</th>
                      <th style={{ textAlign: 'center', padding: '12px', fontWeight: '600', color: '#374151' }}>Velocity</th>
                      <th style={{ textAlign: 'center', padding: '12px', fontWeight: '600', color: '#374151' }}>Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.ownerMetrics.map((owner, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px', color: '#111827', fontWeight: '500' }}>{owner.name}</td>
                        <td style={{ textAlign: 'center', padding: '12px', color: '#374151' }}>{owner.dealCount}</td>
                        <td style={{ textAlign: 'right', padding: '12px', color: '#374151' }}>{formatCurrency(owner.totalValue)}</td>
                        <td style={{ textAlign: 'center', padding: '12px', color: owner.closingRate > 50 ? '#16a34a' : '#d97706', fontWeight: '600' }}>
                          {owner.closingRate}%
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px', color: '#374151' }}>
                          <div style={{
                            background: '#e5e7eb',
                            height: '6px',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            width: '100%'
                          }}>
                            <div style={{
                              background: owner.velocityScore > 60 ? '#16a34a' : '#d97706',
                              height: '100%',
                              width: owner.velocityScore + '%'
                            }}></div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px', fontWeight: '600', color: owner.pipelineHealth > 60 ? '#16a34a' : '#d97706' }}>
                          {owner.pipelineHealth}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}