// Admin reports - the report drawn on screen, laid out like the PDF
import logoImg from '../../../../shared/client/src/assets/logo.jpeg';
import { INSTITUTE } from '../../../../shared/client/src/constants/institute';

// KPI tiles
function KpiTiles({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="report-kpis">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className={`report-kpi tone-${item.tone || 'default'}`}>
          <span className="report-kpi-label">{item.label}</span>
          <span className="report-kpi-value">{item.value}</span>
          {item.note && <span className="report-kpi-note">{item.note}</span>}
        </div>
      ))}
    </div>
  );
}

function ReportTable({ block }) {
  return (
    <div className="report-block">
      {block.title && <h4 className="report-block-title">{block.title}</h4>}
      {block.rows.length === 0 ? (
        <p className="report-empty">{block.emptyText}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table report-table">
            <thead>
              <tr>
                {block.columns.map((column) => (
                  <th key={`${column.label}-${column.align}`} className={column.align === 'right' ? 'num' : ''}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      className={[
                        block.columns[index].align === 'right' ? 'num' : '',
                        block.columns[index].nowrap ? 'nowrap' : '',
                        cell.tone ? `tone-${cell.tone}` : '',
                      ].join(' ')}
                    >
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {block.totals && (
              <tfoot>
                <tr>
                  {block.totals.map((cell, index) => (
                    <td key={index} className={block.columns[index].align === 'right' ? 'num nowrap' : ''}>
                      {cell.text}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {block.note && <p className="report-note">{block.note}</p>}
    </div>
  );
}

// horizontal bar chart
function ReportBars({ block }) {
  return (
    <div className="report-block">
      {block.title && <h4 className="report-block-title">{block.title}</h4>}
      {block.items.length === 0 || block.max <= 0 ? (
        <p className="report-empty">{block.emptyText}</p>
      ) : (
        <div className="report-bars">
          {block.items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="report-bar-row">
              <span className="report-bar-label">{item.label}</span>
              <span className="report-bar-track">
                <span className="report-bar-fill" style={{ width: `${Math.max(1, (item.value / block.max) * 100)}%` }} />
              </span>
              <span className="report-bar-value">{item.display}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// vertical column chart
function ReportColumns({ block }) {
  const many = block.items.length > 14;
  const step = Math.ceil(block.items.length / 12);
  return (
    <div className="report-block">
      {block.title && <h4 className="report-block-title">{block.title}</h4>}
      {block.items.length === 0 || block.max <= 0 ? (
        <p className="report-empty">No data for this period.</p>
      ) : (
        <div className="report-columns" role="img" aria-label={block.title}>
          {block.items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="report-column" title={`${item.label}: ${item.display}`}>
              {!many && <span className="report-column-value">{item.display}</span>}
              <span className="report-column-bar" style={{ height: `${Math.max(item.value > 0 ? 1 : 0, (item.value / block.max) * 100)}%` }} />
              <span className="report-column-label">{many && index % step !== 0 ? '' : item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportFacts({ block }) {
  return (
    <div className="report-block">
      {block.title && <h4 className="report-block-title">{block.title}</h4>}
      <dl className="report-facts">
        {block.items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="report-fact">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReportSignatures({ block }) {
  return (
    <div className="report-signatures">
      {block.items.map((role) => (
        <div key={role} className="report-signature">
          <span className="report-signature-line" />
          <strong>{role}</strong>
          <span>Name / Signature / Date</span>
        </div>
      ))}
    </div>
  );
}

function ReportBlock({ block }) {
  if (block.type === 'table') return <ReportTable block={block} />;
  if (block.type === 'bars') return <ReportBars block={block} />;
  if (block.type === 'columns') return <ReportColumns block={block} />;
  if (block.type === 'facts') return <ReportFacts block={block} />;
  if (block.type === 'kpis') return <KpiTiles items={block.items} />;
  if (block.type === 'signatures') return <ReportSignatures block={block} />;
  if (block.type === 'note') return <p className="report-note">{block.text}</p>;
  if (block.type === 'heading') return <h4 className="report-subheading">{block.text}</h4>;
  return null;
}

function ReportView({ report }) {
  const details = [
    ['Report number', report.reportNumber],
    ['Generated on', report.generatedText],
    ['Reporting period', report.periodLabel],
    ['Prepared by', report.generatedBy],
    ...report.parameters.map((item) => [item.label, item.value]),
  ];

  return (
    <article className="report-paper">
      <header className="report-letterhead">
        <img src={logoImg} alt="" className="report-logo" />
        <div className="report-brand">
          <span className="report-brand-name">BRILLIANT INSTITUTE</span>
          <span className="report-brand-tag">Brilliant Makes Brilliance · Since 1982</span>
        </div>
        <div className="report-letterhead-meta">
          <span>{report.title}</span>
          <span className="muted">{report.reportNumber}</span>
        </div>
      </header>

      <h2 className="report-title">{report.title}</h2>
      {report.subtitle && <p className="report-subtitle">{report.subtitle}</p>}

      <dl className="report-details">
        {details.map(([label, value]) => (
          <div key={label} className="report-detail">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <KpiTiles items={report.summary} />

      {report.highlights.length > 0 && (
        <div className="report-findings">
          <span className="report-findings-title">Key findings</span>
          <ul>
            {report.highlights.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}

      {report.sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="report-section">
          <h3 className="report-section-title">
            <span className="report-section-number">{index + 1}</span>
            {section.title}
          </h3>
          {section.intro && <p className="report-intro">{section.intro}</p>}
          {section.blocks.map((block, blockIndex) => (
            <ReportBlock key={blockIndex} block={block} />
          ))}
        </section>
      ))}

      <footer className="report-footer">
        <span>End of report</span>
        <small>
          Confidential - for the management of {INSTITUTE.name}. {INSTITUTE.address} · {INSTITUTE.email} · {INSTITUTE.phone}
        </small>
      </footer>
    </article>
  );
}

export default ReportView;
