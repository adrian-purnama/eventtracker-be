const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { htmlToWordXml, formatDescriptionForWord, injectHyperlinkRels } = require('../helper/htmlToWordXml.helper.js');
const eventModel = require('../model/event.model');
const { validateToken } = require('../helper/validate.helper');
const { parseCsvSimple } = require('../helper/csv.helper');
const eventParticipantStagingMetaModel = require('../model/eventParticipantStagingMeta.model');
const eventParticipantStagingModel = require('../model/eventParticipantStaging.model');
const eventParticipantModel = require('../model/eventParticipant.model');
const eventParticipantMetaModel = require('../model/eventParticipantMeta.model');

router.use(validateToken);


router.post('/create-event', async (req, res) => {
  try {
    const { name, activityType, collaborators} = req.body;

    if (!name || !activityType) {
      return res.status(400).json({
        success: false,
        message: 'name and activityType are required',
      });
    }

    const collaboratorIds = Array.isArray(collaborators) ? collaborators : [];

    const event = await eventModel.create({
      name,
      activityType,
      collaborators: collaboratorIds,
      eventCreator: req.userId,
      eventLog: [{ logMessage: 'Event created by ' + req.user.email }],
    });

    return res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create event',
    });
  }
});

// POST /upload-participants-csv/:eventId – process CSV; only event creator or collaborators
router.post('/upload-participants/:eventId', async (req, res) => {
  try {
    const event = await eventModel.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'Only the event creator or collaborators can upload participants',
      });
    }

    const csvRaw = req.body?.csv ?? req.body;
    const { columnNames, rows } = parseCsvSimple(csvRaw);
    

    const instanceId = uuidv4();
    const eventParticipantStagingMeta = await eventParticipantStagingMetaModel.create({
      instanceId,
      event: event._id,
      columnNames,
    });
    for(let i = 0; i < rows.length; i++) {

      const row = rows[i];
      const eventParticipantStaging = await eventParticipantStagingModel.create({
        instanceId,
        event: event._id,
        data: row,
      });
    }


    return res.status(200).json({
      success: true,
      message: 'CSV processed',
      data: { instanceId },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to process CSV',
    });
  }
});

router.get('/get-instance', async (req, res) => {
  const { instanceId } = req.query;
  const instance = await eventParticipantStagingMetaModel.findOne({instanceId});
  if (!instance) {
    return res.status(404).json({
      success: false,
      message: 'Instance not found',
    });
  }
  
  //get top 10 rows from eventParticipantStaging
  const rows = await eventParticipantStagingModel.find({instanceId}).limit(10);


  //get all column names from eventParticipantStagingMeta
  const columnNames = instance.columnNames;


  //get info total rows, duplicate value, missing value, and total rows after cleaned
  const totalRows = rows.length;
  const duplicateValue = rows.filter((row, index, self) =>
    self.findIndex((t) => t.data === row.data) !== index
  ).length;
  const missingValue = rows.filter((row) => Object.values(row.data).some((value) => value === '')).length;
  const totalRowsAfterClean = totalRows - duplicateValue - missingValue;


  //return all data
  return res.status(200).json({
    success: true,
    message: 'Instance fetched successfully',
    data: { instance, rows, columnNames, totalRows, duplicateValue, missingValue, totalRowsAfterClean },
  });
});

// POST /save-staging – save staging to eventParticipant + eventParticipantMeta, then delete staging
router.post('/save-staging', async (req, res) => {
  try {
    const { instanceId, columnsToInclude, searchableColumns } = req.body;
 
    const eventParticipantMetaStaging = await eventParticipantStagingMetaModel.findOne({ instanceId });
    if (!eventParticipantMetaStaging) {
      return res.status(404).json({
        success: false,
        message: 'Event participant meta staging not found',
      });
    }
    
    const eventParticipantStaging = await eventParticipantStagingModel.find({instanceId});
    if (!eventParticipantStaging) {
      return res.status(404).json({
        success: false,
        message: 'Event participant staging not found',
      });
    }

    const event = await eventModel.findById(eventParticipantMetaStaging.event);
    const eventId = event._id;
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    //validate event owner / collabolator
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to save staging',
      });
    }
    //validate columnsToInclude and searchableColumns (both are arrays)
    const stagingColumnNames = eventParticipantMetaStaging.columnNames || [];
    if (!Array.isArray(columnsToInclude) || columnsToInclude.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'columnsToInclude must be a non-empty array',
      });
    }
    const invalidInclude = columnsToInclude.some((col) => !stagingColumnNames.includes(col));
    if (invalidInclude) {
      return res.status(400).json({
        success: false,
        message: 'Columns to include are not valid',
      });
    }
    const searchable = Array.isArray(searchableColumns) ? searchableColumns : [];
    const invalidSearchable = searchable.some((col) => !stagingColumnNames.includes(col));
    if (invalidSearchable) {
      return res.status(400).json({
        success: false,
        message: 'Searchable columns are not valid',
      });
    }

    const searchableFields = searchable.filter((c) => columnsToInclude.includes(c));
    const steps = [];

    try {
      // Step 1: Saving meta
      steps.push('saving meta');
      console.log('[save-staging] Step 1: saving meta');
      await eventParticipantMetaModel.findOneAndUpdate(
        { event: eventId },
        {
          event: eventId,
          columnNames: columnsToInclude,
          searchableFields,
        },
        { upsert: true, new: true }
      );

      // Step 2: Saving participants (filter data by columnsToInclude)
      steps.push('saving participants');
      console.log('[save-staging] Step 2: saving participants', eventParticipantStaging.length, 'rows');
      for (let i = 0; i < eventParticipantStaging.length; i++) {
        const row = eventParticipantStaging[i].data || {};
        const data = {};
        for (const col of columnsToInclude) {
          if (Object.prototype.hasOwnProperty.call(row, col)) {
            data[col] = row[col];
          }
        }
        await eventParticipantModel.create({
          event: eventId,
          data,
        });
      }

      // Step 3: Deleting staging rows
      steps.push('deleting staging participants');
      console.log('[save-staging] Step 3: deleting staging participants');
      const deleteRows = await eventParticipantStagingModel.deleteMany({ instanceId });
      steps.push(`deleted ${deleteRows.deletedCount} staging rows`);

      // Step 4: Deleting staging meta
      steps.push('deleting staging meta');
      console.log('[save-staging] Step 4: deleting staging meta');
      await eventParticipantStagingMetaModel.findOneAndDelete({ instanceId });

      console.log('[save-staging] Done. Participants created:', eventParticipantStaging.length);
      return res.status(200).json({
        success: true,
        message: 'Staging saved successfully',
        data: {
          eventId,
          participantsCreated: eventParticipantStaging.length,
          steps,
        },
      });
    } catch (err) {
      console.error('[save-staging] Failed at steps:', steps, err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to save staging',
        step: steps.length > 0 ? steps[steps.length - 1] : 'unknown',
        steps,
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to save staging',
    });
  }
});

// GET /get-events – events where current user is eventCreator or in collaborators
router.get('/get-events', async (req, res) => {
  try {
    const events = await eventModel
      .find({
        $or: [
          { eventCreator: req.userId },
          { collaborators: req.userId },
        ],
      })
      .populate('activityType')
      .populate('collaborators')
      .populate('eventCreator');
    return res.status(200).json({
      success: true,
      message: 'Events fetched successfully',
      data: events,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch events',
    });
  }
});

// GET /get-event/:id – single event (only if user is creator or collaborator)
router.get('/get-event/:id', async (req, res) => {
  try {
    const event = await eventModel
      .findById(req.params.id)
      .populate('activityType')
      .populate('collaborators')
      .populate('eventCreator')
      .populate('committee')
      .populate('eventApprover')
      .populate('eventManager');
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?._id?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?._id?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this event',
      });
    }
    const data = event.toObject ? event.toObject() : event;
    if (Array.isArray(data.budget)) {
      data.budget = data.budget.map((b) => ({
        item: b.item ?? '',
        type: b.type === 'income' || b.type === 'outcome' ? b.type : 'outcome',
        qty: Number(b.qty) >= 0 ? Number(b.qty) : 1,
        pricePerQty: Number(b.pricePerQty) || 0,
        description: b.description ?? '',
        category: (b.category != null && String(b.category).trim() !== '') ? String(b.category).trim() : 'other',
      }));
    }
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to get event',
    });
  }
});

// GET /download-proposal/:eventId – generate Word from template (creator or collaborator only)
router.get('/download-proposal/:eventId', async (req, res) => {
  try {
    const event = await eventModel
      .findById(req.params.eventId)
      .populate('activityType')
      .populate('committee');
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download proposal for this event',
      });
    }

    const templatePath = path.join(__dirname, '..', 'template', 'template_pengajuan.docx');
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({
        success: false,
        message: 'Template file not found',
      });
    }

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    let nextRIdNum = 100;
    const relsEntry = zip.files['word/_rels/document.xml.rels'];
    if (relsEntry) {
      try {
        const relsXml = relsEntry.asText();
        const rIdMatches = relsXml.match(/Id="rId(\d+)"/g);
        if (rIdMatches && rIdMatches.length > 0) {
          const max = Math.max(...rIdMatches.map((m) => parseInt(m.replace(/\D/g, ''), 10)));
          nextRIdNum = max + 1;
        }
      } catch (_) {}
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const at = event.activityTime && typeof event.activityTime === 'object' ? event.activityTime : {};
    const activityDateStr = event.activityDate
      ? new Date(event.activityDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const startTime = (at.startTime != null && at.startTime !== '') ? String(at.startTime) : '';
    const endTimeStr = at.untilFinish ? 'Until finish' : ((at.endTime != null && at.endTime !== '') ? String(at.endTime) : '');
    const timeStr = startTime && endTimeStr ? `${startTime} - ${endTimeStr}` : (startTime || endTimeStr);

    const activityList = Array.isArray(event.activity) ? event.activity : [];
    const purposeList = Array.isArray(event.purpose) ? event.purpose : [];
    const committeeArr = (event.committee || []).map((u) => {
      const name = (u && (u.name != null && u.name !== '')) ? String(u.name).trim() : ((u && u.email) ? String(u.email) : '');
      return { name, email: u && u.email ? String(u.email) : '' };
    });
    // committee_list: numbered list using only user name (not email)
    const committeeList = committeeArr.map((c, i) => `${i + 1}. ${(c.name && c.name.trim() !== '') ? c.name.trim() : '—'}`);

    const htmlToPlainText = (html) => {
      if (!html || typeof html !== 'string') return '—';
      let text = html
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim()
        .replace(/\n{3,}/g, '\n\n');
      return text || '—';
    };

    // descriptionFormatted = Word OOXML for bold/lists/structure (React Quill). Template must use {@descriptionFormatted} in the Description cell.
    const runDownList = (event.runDown || []).map((r) => {
      const waktu = [r.timeStart, r.timeEnd].filter(Boolean).join(' - ') || '—';
      const duration = r.durationMinutes != null ? String(r.durationMinutes) : '—';
      const description = htmlToPlainText(r.description);
      const descriptionFormatted = htmlToWordXml(r.description);
      return {
        waktu,
        duration,
        name: r.name || '—',
        description,
        descriptionFormatted,
      };
    });

    const formatRupiah = (num) => {
      const n = Number(num);
      if (num === '' || num === null || num === undefined || Number.isNaN(n)) return 'Rp 0,00';
      const intPart = Math.floor(Math.abs(n));
      const decPart = Math.round((Math.abs(n) - intPart) * 100);
      const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return (n < 0 ? '-' : '') + `Rp ${intStr},${String(decPart).padStart(2, '0')}`;
    };

    // budgetByCategory: template must use {@descriptionDisplayXml} in the Description cell so URLs show as short clickable "Link"; {description} is plain text only.
    const budgetRaw = Array.isArray(event.budget) ? event.budget : [];
    const seenCategories = new Set();
    const budgetByCategory = [];
    const hyperlinkRels = [];
    for (const b of budgetRaw) {
      const cat = (b.category != null && String(b.category).trim() !== '') ? String(b.category).trim() : 'other';
      if (!seenCategories.has(cat)) {
        seenCategories.add(cat);
        const itemsInCat = budgetRaw.filter((x) => ((x.category != null && String(x.category).trim() !== '') ? String(x.category).trim() : 'other') === cat);
        const total = itemsInCat.reduce((sum, x) => sum + (Number(x.qty) || 0) * (Number(x.pricePerQty) || 0), 0);
        budgetByCategory.push({
          categoryName: cat,
          items: itemsInCat.map((x) => {
            const rId = 'rId' + String(nextRIdNum++);
            const descResult = formatDescriptionForWord(x.description, rId);
            if (descResult.relationship) hyperlinkRels.push(descResult.relationship);
            return {
              item: x.item ?? '—',
              type: x.type === 'income' ? 'Income' : 'Outcome',
              qty: Number(x.qty) || 0,
              pricePerQty: Number(x.pricePerQty) || 0,
              priceDisplay: formatRupiah(Number(x.pricePerQty) || 0),
              description: x.description ?? '—',
              descriptionDisplayXml: descResult.xml,
              lineTotal: (Number(x.qty) || 0) * (Number(x.pricePerQty) || 0),
              lineTotalDisplay: formatRupiah((Number(x.qty) || 0) * (Number(x.pricePerQty) || 0)),
            };
          }),
          totalDisplay: formatRupiah(total),
        });
      }
    }

    const renderData = {
      event_name: event.name || '',
      activity_type: (event.activityType && event.activityType.name) ? event.activityType.name : '',
      event_description: event.description || '',
      activity: activityList.map((text, i) => `${i + 1}. ${text || ''}`),
      purpose: purposeList.map((text, i) => `${i + 1}. ${text || ''}`),
      activity_date: activityDateStr,
      date: activityDateStr,
      activity_location: event.activityLocation || '',
      location: event.activityLocation || '',
      activity_start_time: startTime,
      activity_end_time: endTimeStr,
      start_time: startTime,
      end_time: endTimeStr,
      time: timeStr,
      target_audience: event.targetAudience != null ? String(event.targetAudience) : '0',
      committee: committeeArr,
      committee_list: committeeList,
      runDown: runDownList,
      budgetByCategory,
    };
    console.log('[download-proposal] render data:', JSON.stringify(renderData, null, 2));
    doc.render(renderData);

    // Retain table column sizes: set fixed layout so Word does not resize columns
    const outZip = doc.getZip();
    const docEntry = outZip.files['word/document.xml'];
    if (docEntry) {
      let docXml = docEntry.asText();
      docXml = docXml.replace(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/g, (m, inner) => {
        if (/<w:tblLayout/i.test(inner)) return m;
        return '<w:tblPr><w:tblLayout w:type="fixed"/>' + inner + '</w:tblPr>';
      });
      outZip.file('word/document.xml', docXml);
    }

    // Inject hyperlink relationships so budget item URL descriptions open as clickable links
    const relsKey = 'word/_rels/document.xml.rels';
    const outRelsEntry = outZip.files[relsKey];
    if (outRelsEntry && Array.isArray(hyperlinkRels) && hyperlinkRels.length > 0) {
      const relsXml = outRelsEntry.asText();
      const updatedRels = injectHyperlinkRels(relsXml, hyperlinkRels);
      if (updatedRels !== relsXml) outZip.file(relsKey, updatedRels);
    }

    const buf = outZip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    const safeName = (event.name || 'proposal').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}_pengajuan.docx"`
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to generate proposal',
    });
  }
});

// GET /participants-check/:eventId – check if event already has participants
router.get('/participants-check/:eventId', async (req, res) => {
  try {
    const event = await eventModel.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this event',
      });
    }
    const count = await eventParticipantModel.countDocuments({ event: event._id });
    return res.status(200).json({
      success: true,
      data: { hasParticipants: count > 0 },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to check participants',
    });
  }
});

// GET /participants/:eventId – fetch existing participants and meta for event
router.get('/participants/:eventId', async (req, res) => {
  try {
    const event = await eventModel.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this event',
      });
    }
    const meta = await eventParticipantMetaModel.findOne({ event: event._id });
    const participants = await eventParticipantModel
      .find({ event: event._id })
      .sort({ createdAt: 1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: {
        meta: meta
          ? { columnNames: meta.columnNames || [], searchableFields: meta.searchableFields || [] }
          : null,
        participants: participants.map((p) => ({
          _id: p._id,
          data: p.data || {},
          present: p.present === true,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch participants',
    });
  }
});

// PATCH /participants/:eventId/:participantId – mark participant present/absent
router.patch('/participants/:eventId/:participantId', async (req, res) => {
  try {
    const event = await eventModel.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update participants for this event',
      });
    }
    const { present } = req.body;
    const participant = await eventParticipantModel.findOneAndUpdate(
      { _id: req.params.participantId, event: event._id },
      { present: present === true },
      { new: true }
    );
    if (!participant) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: { _id: participant._id, present: participant.present },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to mark participant',
    });
  }
});

// DELETE /participants/:eventId – delete all participants and meta for event (creator/collaborator only)
router.delete('/participants/:eventId', async (req, res) => {
  try {
    const event = await eventModel.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete participants for this event',
      });
    }
    const eventId = event._id;
    const participantsResult = await eventParticipantModel.deleteMany({ event: eventId });
    const metaResult = await eventParticipantMetaModel.deleteMany({ event: eventId });
    return res.status(200).json({
      success: true,
      message: 'All participants and meta deleted. You can re-upload.',
      data: {
        participantsDeleted: participantsResult.deletedCount,
        metaDeleted: metaResult.deletedCount,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete participants',
    });
  }
});

// PUT /update-event/:id – only event creator or collaborators can update
router.put('/update-event/:id', async (req, res) => {
  try {
    const event = await eventModel.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }
    const isCreator = event.eventCreator?.toString() === req.userId?.toString();
    const isCollaborator = event.collaborators?.some(
      (c) => c?.toString() === req.userId?.toString()
    );
    if (!isCreator && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: 'Only the event creator or collaborators can update this event',
      });
    }

    const {
      name,
      activityType,
      collaborators,
      description,
      activity,
      purpose,
      activityDate,
      activityTime,
      activityLocation,
      targetAudience,
      committee,
      runDown,
      budget,
      eventApprover,
      eventManager,
    } = req.body;

    const setFields = {};
    if (name !== undefined) setFields.name = name;
    if (activityType !== undefined) setFields.activityType = activityType;
    if (eventApprover !== undefined) setFields.eventApprover = eventApprover || null;
    if (eventManager !== undefined) setFields.eventManager = eventManager || null;
    if (collaborators !== undefined) setFields.collaborators = Array.isArray(collaborators) ? collaborators : event.collaborators;
    if (description !== undefined) setFields.description = description;
    if (activity !== undefined) setFields.activity = Array.isArray(activity) ? activity : [];
    if (purpose !== undefined) setFields.purpose = Array.isArray(purpose) ? purpose : [];
    if (activityDate !== undefined) setFields.activityDate = activityDate ? new Date(activityDate) : undefined;
    if (activityTime !== undefined) setFields.activityTime = activityTime;
    if (activityLocation !== undefined) setFields.activityLocation = activityLocation;
    if (targetAudience !== undefined) setFields.targetAudience = Number(targetAudience) || 0;
    if (committee !== undefined) setFields.committee = Array.isArray(committee) ? committee : event.committee;
    if (runDown !== undefined) {
      const normalized = (Array.isArray(runDown) ? runDown : event.runDown).map((item) => {
        const timeStart = (item.timeStart || '').trim();
        const timeEnd = (item.timeEnd || '').trim();
        let durationMinutes = Number(item.durationMinutes);
        if (timeStart && timeEnd) {
          const parseMinutes = (str) => {
            const parts = str.match(/^(\d{1,2}):(\d{2})$/);
            if (!parts) return NaN;
            return parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
          };
          const startM = parseMinutes(timeStart);
          const endM = parseMinutes(timeEnd);
          if (!Number.isNaN(startM) && !Number.isNaN(endM)) durationMinutes = Math.max(0, endM - startM);
        }
        return {
          timeStart: item.timeStart ?? '',
          timeEnd: item.timeEnd ?? '',
          durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 0,
          name: item.name ?? '',
          description: item.description ?? '',
        };
      });
      setFields.runDown = normalized;
    }
    if (budget !== undefined) {
      const normalized = (Array.isArray(budget) ? budget : event.budget).map((item) => ({
        item: item.item ?? '',
        type: item.type === 'income' || item.type === 'outcome' ? item.type : 'outcome',
        qty: Number(item.qty) >= 0 ? Number(item.qty) : 1,
        pricePerQty: Number(item.pricePerQty) || 0,
        description: item.description ?? '',
        category: (item.category != null && String(item.category).trim() !== '') ? String(item.category).trim() : 'other',
      }));
      setFields.budget = normalized;
    }

    const logEntry = { logMessage: `Event updated by ${req.user?.email ?? req.userId}` };
    const update = { $push: { eventLog: logEntry } };
    if (Object.keys(setFields).length > 0) update.$set = setFields;

    const updated = await eventModel
      .findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .populate('activityType')
      .populate('collaborators')
      .populate('eventCreator')
      .populate('committee')
      .populate('eventApprover')
      .populate('eventManager');

    return res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update event',
    });
  }
});



module.exports = router;
