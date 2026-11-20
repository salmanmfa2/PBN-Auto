# Update Notes: Web 1.4.2 (Planned)

This note describes the planned scope for Web 1.4.2. Web 1.4.1 remains the current release; items below are not a claim that 1.4.2 has shipped.

## Refactoring

- Split the Analisis Kinerja DJPb service into workflow-focused modules under `backend/app/services/kinerja/`: shared calculations and period handling, uploads, corrections, dashboard/cache, record data, queries, and exports.
- Remove the `performance_kinerja_service.py` compatibility facade and keep `kinerja/__init__.py` lightweight; API and authentication code import only the modules they use.
- Preserve existing endpoint behavior, data rules, correction transactions, and dashboard cache invalidation while reorganizing the implementation.

## Performance improvement focus

Web 1.4.2 will focus on refactoring and performance improvements. Performance work should be guided by profiling and representative datasets rather than assumptions. Areas to assess include:

- Dashboard aggregation and cache behavior.
- Employee record filtering, sorting, and pagination.
- Workbook generation and other data-heavy backend operations.
- Frontend rendering and state updates on large result sets.

The service refactor improves separation of responsibilities but does not, by itself, claim faster runtime. Any performance gains should be measured and reported against a baseline, while regression tests confirm that existing results and workflows remain correct.
