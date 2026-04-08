-- Product Guide: stable navigation keys for seeded sections/topics

alter table public.product_guide_sections
  add column if not exists guide_key text;

alter table public.product_guide_topics
  add column if not exists guide_key text;

with section_map(guide_key, title, sort_order) as (
  values
    ('dashboard', 'Dashboard', 0),
    ('order-map', 'Order Map', 1),
    ('my-cases', 'My Cases', 2),
    ('fulfillment', 'Fulfillment', 3),
    ('invoicing', 'Invoicing', 4),
    ('product-offering', 'Product Offering', 5)
)
update public.product_guide_sections as section_row
set guide_key = section_map.guide_key
from section_map
where section_row.guide_key is null
  and lower(btrim(section_row.title)) = lower(btrim(section_map.title));

with section_map(guide_key, title, sort_order) as (
  values
    ('dashboard', 'Dashboard', 0),
    ('order-map', 'Order Map', 1),
    ('my-cases', 'My Cases', 2),
    ('fulfillment', 'Fulfillment', 3),
    ('invoicing', 'Invoicing', 4),
    ('product-offering', 'Product Offering', 5)
)
update public.product_guide_sections as section_row
set guide_key = section_map.guide_key
from section_map
where section_row.guide_key is null
  and section_row.sort_order = section_map.sort_order
  and not exists (
    select 1
    from public.product_guide_sections as existing
    where existing.guide_key = section_map.guide_key
  );

with topic_map(section_key, guide_key, title, sort_order) as (
  values
    ('dashboard', 'dashboard__overview', 'Overview', 0),
    ('dashboard', 'dashboard-kpi-header', 'Summary KPI Header', 1),
    ('dashboard', 'dashboard-invoice-trend', 'Invoice Trend', 2),
    ('dashboard', 'dashboard-actions-breakdown', 'Quick Actions and Breakdown', 3),
    ('dashboard', 'dashboard-workbench', 'Tabbed Data Management', 4),
    ('order-map', 'order-map__overview', 'Overview', 0),
    ('order-map', 'order-map-geography', 'Geographic Interface and Statistics', 1),
    ('order-map', 'order-map-create', 'Creating a New Order', 2),
    ('order-map', 'order-map-manage-orders', 'Managing My Orders', 3),
    ('my-cases', 'my-cases__overview', 'Overview', 0),
    ('my-cases', 'my-cases-status-cards', 'Status Counter Cards', 1),
    ('my-cases', 'my-cases-filtering', 'Search and Filtering', 2),
    ('my-cases', 'my-cases-pipeline', 'Pipeline Columns', 3),
    ('my-cases', 'my-cases-refresh', 'Live Data Refresh', 4),
    ('fulfillment', 'fulfillment__overview', 'Overview', 0),
    ('fulfillment', 'fulfillment-performance', 'Fulfillment Performance Header', 1),
    ('fulfillment', 'fulfillment-filters', 'Fulfillment Filters', 2),
    ('fulfillment', 'fulfillment-pipeline', 'Fulfillment Pipeline', 3),
    ('fulfillment', 'fulfillment-refresh', 'Global Navigation and Refresh', 4),
    ('invoicing', 'invoicing__overview', 'Overview', 0),
    ('invoicing', 'invoicing-summary', 'Financial Summary Header', 1),
    ('invoicing', 'invoicing-tools', 'Invoicing Tools and Display Controls', 2),
    ('invoicing', 'invoicing-board', 'Invoicing Pipeline', 3),
    ('invoicing', 'invoicing-refresh', 'Global Controls', 4),
    ('product-offering', 'product-offering__overview', 'Overview', 0),
    ('product-offering', 'product-offering-tiers', 'Pricing Tiers', 1),
    ('product-offering', 'product-offering-criteria', 'Evaluation Criteria', 2),
    ('product-offering', 'product-offering-ordering', 'Place Order Workflow', 3)
)
update public.product_guide_topics as topic_row
set guide_key = topic_map.guide_key
from topic_map
join public.product_guide_sections as section_row
  on section_row.id = topic_row.section_id
where topic_row.guide_key is null
  and section_row.guide_key = topic_map.section_key
  and lower(btrim(topic_row.title)) = lower(btrim(topic_map.title));

with topic_map(section_key, guide_key, title, sort_order) as (
  values
    ('dashboard', 'dashboard__overview', 'Overview', 0),
    ('dashboard', 'dashboard-kpi-header', 'Summary KPI Header', 1),
    ('dashboard', 'dashboard-invoice-trend', 'Invoice Trend', 2),
    ('dashboard', 'dashboard-actions-breakdown', 'Quick Actions and Breakdown', 3),
    ('dashboard', 'dashboard-workbench', 'Tabbed Data Management', 4),
    ('order-map', 'order-map__overview', 'Overview', 0),
    ('order-map', 'order-map-geography', 'Geographic Interface and Statistics', 1),
    ('order-map', 'order-map-create', 'Creating a New Order', 2),
    ('order-map', 'order-map-manage-orders', 'Managing My Orders', 3),
    ('my-cases', 'my-cases__overview', 'Overview', 0),
    ('my-cases', 'my-cases-status-cards', 'Status Counter Cards', 1),
    ('my-cases', 'my-cases-filtering', 'Search and Filtering', 2),
    ('my-cases', 'my-cases-pipeline', 'Pipeline Columns', 3),
    ('my-cases', 'my-cases-refresh', 'Live Data Refresh', 4),
    ('fulfillment', 'fulfillment__overview', 'Overview', 0),
    ('fulfillment', 'fulfillment-performance', 'Fulfillment Performance Header', 1),
    ('fulfillment', 'fulfillment-filters', 'Fulfillment Filters', 2),
    ('fulfillment', 'fulfillment-pipeline', 'Fulfillment Pipeline', 3),
    ('fulfillment', 'fulfillment-refresh', 'Global Navigation and Refresh', 4),
    ('invoicing', 'invoicing__overview', 'Overview', 0),
    ('invoicing', 'invoicing-summary', 'Financial Summary Header', 1),
    ('invoicing', 'invoicing-tools', 'Invoicing Tools and Display Controls', 2),
    ('invoicing', 'invoicing-board', 'Invoicing Pipeline', 3),
    ('invoicing', 'invoicing-refresh', 'Global Controls', 4),
    ('product-offering', 'product-offering__overview', 'Overview', 0),
    ('product-offering', 'product-offering-tiers', 'Pricing Tiers', 1),
    ('product-offering', 'product-offering-criteria', 'Evaluation Criteria', 2),
    ('product-offering', 'product-offering-ordering', 'Place Order Workflow', 3)
)
update public.product_guide_topics as topic_row
set guide_key = topic_map.guide_key
from topic_map
join public.product_guide_sections as section_row
  on section_row.id = topic_row.section_id
where topic_row.guide_key is null
  and section_row.guide_key = topic_map.section_key
  and topic_row.sort_order = topic_map.sort_order
  and not exists (
    select 1
    from public.product_guide_topics as existing
    where existing.guide_key = topic_map.guide_key
  );

create unique index if not exists idx_product_guide_sections_guide_key
  on public.product_guide_sections(guide_key)
  where guide_key is not null;

create unique index if not exists idx_product_guide_topics_guide_key
  on public.product_guide_topics(guide_key)
  where guide_key is not null;

notify pgrst, 'reload schema';
