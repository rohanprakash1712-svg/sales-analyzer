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

  const downloadSampleCSV = () => {
    const sample = `Company,Deal Value,Stage,Last Activity Date,Owner
Acme Corp,50000,Negotiation,2026-04-10,Rohan
Beta Ltd,30000,Proposal Sent,2026-04-05,Amit
Gamma Inc,20000,Discovery,2026-03-30,Sneha
Delta Co,80000,Negotiation,2026-04-13,Rohan
Zeta Pvt,15000,Proposal Sent,2026-04-01,Amit`;

    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_pipeline.csv';
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

      const parsed = deals.map(d => {
        const lastDate = new Date(d['Last Activity Date']);
        const days = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        return {
          company: d.Company,
          value: parseInt(d['Deal Value']) || 0,
          stage: d.Stage,
          days
        };
      });

      const stageThreshold = {
        'Negotiation': 1,
        'Proposal Sent': 2,
        'Discovery': 3
      };

      const atRisk = parsed.filter(d => {
        return d.days > (stageThreshold[d.stage] || 0);
      });

      const leaks = parsed.filter(d => d.days > 7);

      const highProb = parsed.filter(d =>
        d.days <= 3 && (d.stage === 'Negotiation' || d.stage === 'Proposal Sent')
      );

      const topRisk = [...atRisk]
        .sort((a, b) => {
          const diffA = a.days - (stageThreshold[a.stage] || 0);
          const diffB = b.days - (stageThreshold[b.stage] || 0);
          return diffA - diffB;
        })
        .slice(0, 3);

      const topLeaks = [...leaks]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

      const topHigh = [...highProb]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

      const sum = arr => arr.reduce((s, d) => s + d.value, 0);
      const totalValue = sum(parsed);
      const riskValue = sum(leaks);

      const score = Math.max(
        0,
        Math.min(100, Math.round(100 - (riskValue / (totalValue || 1)) * 60))
      );

      const scoreExplanation =
        score > 75
          ? 'Strong pipeline with healthy deal movement'
          : score > 50
          ? 'Moderate pipeline risk, needs attention'
          : 'Weak pipeline, high inactivity and leakage';

      const nextActions = [...parsed]
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);

      setAiLoading(true);
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis: { totalDeals: parsed.length, riskValue, score } })
        });
        const data = await response.json();
        setAiSummary(data?.summary || 'AI insights unavailable');
      } catch {
        setAiSummary('AI insights unavailable');
      }
      setAiLoading(false);

      setReport({ score, scoreExplanation, riskValue, topRisk, topLeaks, topHigh, nextActions });
    } catch {
      setError('Error analyzing CSV');
    }

    setLoading(false);
  };

  const RiskCard = ({ company, days, value, why, variant = 'default' }) => {
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
            Identify risk. Prioritize deals. Close faster.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>

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
              {loading ? '⏳ Analyzing...' : '🚀 Analyze Pipeline'}
            </button>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
            CSV should contain: Company, Deal Value, Stage, Last Activity Date, Owner
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
                {formatCurrency(report.riskValue)} at risk
              </p>
            </div>

            {/* Stats Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '16px'
            }}>
              <StatCard label="Top Risks" value={report.topRisk.length} variant="critical" />
              <StatCard label="Critical Leaks" value={report.topLeaks.length} variant="critical" />
              <StatCard label="High Probability" value={report.topHigh.length} variant="success" />
              <StatCard label="Deals at Risk" value={formatCurrency(report.riskValue)} variant="warning" />
            </div>

            {/* Main Content Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '24px'
            }}>

              {/* Left Column - Insights */}
              <div style={{ display: 'grid', gap: '24px' }}>

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
                      <RiskCard key={i} company={d.company} days={d.days} value={d.value} why={getWhy(d)} variant="critical" />
                    ))
                  )}
                </div>

                {/* Critical Leaks */}
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
                    🕳️ Critical Leaks
                  </h3>
                  {report.topLeaks.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No critical leaks</p>
                  ) : (
                    report.topLeaks.map((d, i) => (
                      <RiskCard key={i} company={d.company} days={d.days} value={d.value} why={getWhy(d)} variant="critical" />
                    ))
                  )}
                </div>

                {/* High Opportunities */}
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
                    🟢 High Probability Deals
                  </h3>
                  {report.topHigh.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No high probability deals</p>
                  ) : (
                    report.topHigh.map((d, i) => (
                      <RiskCard key={i} company={d.company} days={d.days} value={d.value} why={getWhy(d)} variant="success" />
                    ))
                  )}
                </div>

              </div>

              {/* Right Column - Actions & Insights */}
              <div style={{ display: 'grid', gap: '24px', gridTemplateRows: 'auto auto auto' }}>

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
                          <p key={i} style={{ fontSize: '13px', color: '#374151', margin: '8px 0', lineHeight: '1.5' }}>
                            {line}
                          </p>
                        )
                      ))}
                    </div>
                  )}
                </div>

                {/* Next Actions */}
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
                    ✅ Next Actions
                  </h3>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {report.nextActions.map((d, i) => (
                      <div key={i} style={{
                        padding: '10px',
                        background: d.days > 7 ? '#fee2e2' : '#f9fafb',
                        borderRadius: '8px',
                        fontSize: '12px',
                        borderLeft: d.days > 7 ? '3px solid #dc2626' : '3px solid #d1d5db'
                      }}>
                        <div style={{ fontWeight: '600', color: '#374151', marginBottom: '2px' }}>
                          {d.company}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '11px' }}>
                          {d.days} days {d.days > 7 && '(Overdue)'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}