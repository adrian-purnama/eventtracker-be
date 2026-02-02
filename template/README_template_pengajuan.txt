Template placeholders for template_pengajuan.docx (docxtemplater syntax):

Table column sizes: The download step sets fixed table layout so column widths are not resized.
  To control widths in the template: Table Properties > Table > Option "Fixed column width" or set
  column widths in Table Properties > Column. Those widths will be preserved in the generated docx.

Single values:
  {event_name}
  {activity_type}
  {event_description}
  {activity_date} or {date}
  {activity_location} or {location}
  {activity_start_time} or {start_time}
  {activity_end_time} or {end_time}
  {time} (combined "start - end")
  {target_audience}
  committee_list: loop "1. Name", "2. Name", ... use {#committee_list}{.}{/committee_list}
  committee: loop with {name} per item use {#committee}{name}{/committee}

Loops (use {.} for activity/purpose; for one item per line, put {.} on its own paragraph in Word):
  In Word: type {#activity} then press Enter. On the new line type {.} then press Enter. Type {/activity}.
  Same for purpose: {#purpose} then Enter, {.} then Enter, {/purpose}.
  Activity:  {#activity}{.}{/activity}
  Purpose:   {#purpose}{.}{/purpose}
  Committee (numbered): {#committee_list}{.}{/committee_list}  (put {.} on its own paragraph for one per line)
  Committee (per item):  {#committee}{name}{/committee}

Rundown table:
  Create a table with header row:
    | Waktu              | Duration | Kegiatan | Description |
  Add one data row. In that row, put one tag per cell (so the row repeats for each item):
    Cell 1: {#runDown}
    Cell 2: {waktu}
    Cell 3: {duration}
    Cell 4: {name}
    Cell 5: {@descriptionFormatted}{/runDown}   <-- USE THIS for formatted output (bold, lists, structure)
    (Plain text alternative: {description} - no formatting)
  *** IMPORTANT: To get bold, numbered lists (1. 2. 3.), and bullet lists (•) from React Quill
      in the downloaded Word, the Description cell MUST contain {@descriptionFormatted},
      not {description}. {description} gives plain text only.
  Fields per row: waktu = "start - end" time, duration = minutes, name = Kegiatan.

Budget (one table per category):
  Use {#budgetByCategory} to loop over categories. For each category you get:
    {categoryName}   = category name (e.g. Income, Food, Decoration)
    {totalDisplay}   = total for that category formatted as "Rp X.XXX.XXX,00"
    {#items} ... {/items} = loop over budget rows in that category
  Per item in {#items}: {item}, {type} (Income/Outcome), {qty}, {priceDisplay}, {lineTotalDisplay}, and for Description use {@descriptionDisplayXml} (recommended) or {description}.
  In the Word template:
    1. Type a heading or paragraph: {#budgetByCategory}{categoryName}{/budgetByCategory} (to show category names only)
    OR better: one section per category with a table:
    2. For each category block: {#budgetByCategory}
         - Paragraph: {categoryName} (or "Budget: {categoryName}")
         - Table with header row: | Item | Type | Qty | Price per qty | Line total | Description |
         - One data row with cells: {#items} | {item} | {type} | {qty} | {priceDisplay} | {lineTotalDisplay} | {@descriptionDisplayXml} | {/items}
         - Paragraph: Total: {totalDisplay}
       {/budgetByCategory}
  So: put {#budgetByCategory} before the category title, then add a table. In the table's data row put
  {#items} in first cell, {item} in second, {type} in third, {qty}, {priceDisplay}, {lineTotalDisplay}, and in the Description cell use {@descriptionDisplayXml} (not {description}).
  *** IMPORTANT for Description: Use {@descriptionDisplayXml} so that URLs become a short clickable "Link"; {description} shows the full text/URL and is not clickable.
  Repeat for each category.
