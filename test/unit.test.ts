import { getEpiFixture, getIpsFixture, getPvFixture, getLensFixture, extractLensCode } from './helpers/mockClients';

describe('Focusing Manager - Unit Tests', () => {
  describe('Fixture Loading', () => {
    test('should load ePI JSON fixture', () => {
      const epi = getEpiFixture('json');
      
      expect(epi).toBeDefined();
      expect(epi.resourceType).toBe('Bundle');
      expect(epi.type).toBe('document');
      expect(epi.entry).toBeDefined();
      expect(Array.isArray(epi.entry)).toBe(true);
    });

    test('should load ePI XML fixture', () => {
      const epiXml = getEpiFixture('xml');
      
      expect(epiXml).toBeDefined();
      expect(typeof epiXml).toBe('string');
      expect(epiXml).toContain('<?xml');
      expect(epiXml).toContain('Bundle');
    });

    test('should load ePI TTL fixture', () => {
      const epiTtl = getEpiFixture('ttl');
      
      expect(epiTtl).toBeDefined();
      expect(typeof epiTtl).toBe('string');
      expect(epiTtl).toContain('@prefix');
    });

    test('should load IPS JSON fixture', () => {
      const ips = getIpsFixture('json');
      
      expect(ips).toBeDefined();
      expect(ips.resourceType).toBe('Bundle');
      expect(ips.type).toBe('document');
      expect(ips.entry).toBeDefined();
      
      // Check for Patient resource
      const hasPatient = ips.entry.some((entry: any) => entry.resource?.resourceType === 'Patient');
      expect(hasPatient).toBe(true);
    });

    test('should load IPS XML fixture', () => {
      const ipsXml = getIpsFixture('xml');
      
      expect(ipsXml).toBeDefined();
      expect(typeof ipsXml).toBe('string');
      expect(ipsXml).toContain('<Bundle');
      expect(ipsXml).toContain('xmlns="http://hl7.org/fhir"');
    });

    test('should load IPS TTL fixture', () => {
      const ipsTtl = getIpsFixture('ttl');
      
      expect(ipsTtl).toBeDefined();
      expect(typeof ipsTtl).toBe('string');
      expect(ipsTtl).toContain('@prefix');
    });

    test('should load PV JSON fixture', () => {
      const pv = getPvFixture('json');
      
      expect(pv).toBeDefined();
      expect(pv.resourceType).toBe('Bundle');
      expect(pv.entry).toBeDefined();
    });

    test('should load PV XML fixture', () => {
      const pvXml = getPvFixture('xml');
      
      expect(pvXml).toBeDefined();
      expect(typeof pvXml).toBe('string');
      expect(pvXml).toContain('<?xml');
    });

    test('should load PV TTL fixture', () => {
      const pvTtl = getPvFixture('ttl');
      
      expect(pvTtl).toBeDefined();
      expect(typeof pvTtl).toBe('string');
      expect(pvTtl).toContain('@prefix');
    });

    test('should load pregnancy lens fixture', () => {
      const lens = getLensFixture('pregnancy');
      
      expect(lens).toBeDefined();
      expect(lens.resourceType).toBe('Library');
      expect(lens.id).toBeDefined();
      expect(lens.name).toBeDefined();
      expect(lens.content).toBeDefined();
    });

    test('should load conditions lens fixture', () => {
      const lens = getLensFixture('conditions');
      
      expect(lens).toBeDefined();
      expect(lens.resourceType).toBe('Library');
      expect(lens.id).toBeDefined();
      expect(lens.name).toBeDefined();
      expect(lens.content).toBeDefined();
    });
  });

  describe('Lens Code Extraction', () => {
    test('should extract lens code from pregnancy lens', () => {
      const lens = getLensFixture('pregnancy');
      const code = extractLensCode(lens);
      
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    test('should extract lens code from conditions lens', () => {
      const lens = getLensFixture('conditions');
      const code = extractLensCode(lens);
      
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });
  });

  describe('FHIR Resource Structure Validation', () => {
    test('ePI should contain Composition resource', () => {
      const epi = getEpiFixture('json');
      
      const composition = epi.entry.find((entry: any) => entry.resource?.resourceType === 'Composition');
      expect(composition).toBeDefined();
      expect(composition.resource.type).toBeDefined();
      expect(composition.resource.section).toBeDefined();
    });

    test('ePI Composition should have leaflet sections with HTML content', () => {
      const epi = getEpiFixture('json');
      
      const composition = epi.entry.find((entry: any) => entry.resource?.resourceType === 'Composition');
      expect(composition.resource.section).toBeDefined();
      expect(Array.isArray(composition.resource.section)).toBe(true);
      
      // Check that sections have text.div (HTML content)
      const hasHtmlContent = composition.resource.section.some(
        (section: any) => section.text && section.text.div
      );
      expect(hasHtmlContent).toBe(true);
    });

    test('IPS should contain Patient resource', () => {
      const ips = getIpsFixture();
      
      const patient = ips.entry.find((entry: any) => entry.resource?.resourceType === 'Patient');
      expect(patient).toBeDefined();
      expect(patient.resource.id).toBeDefined();
    });

    test('IPS should contain clinical resources (Condition, Medication, etc.)', () => {
      const ips = getIpsFixture();
      
      const resourceTypes = ips.entry.map((entry: any) => entry.resource?.resourceType);
      const clinicalResources = ['Condition', 'MedicationStatement', 'AllergyIntolerance'];
      
      const hasClinicalData = clinicalResources.some(type => resourceTypes.includes(type));
      expect(hasClinicalData).toBe(true);
    });

    test('PV should contain Observation resources', () => {
      const pv = getPvFixture('json');
      
      const observations = pv.entry.filter((entry: any) => entry.resource?.resourceType === 'Observation');
      expect(observations.length).toBeGreaterThan(0);
    });
  });

  describe('Lens Structure Validation', () => {
    test('pregnancy lens should have required fields', () => {
      const lens = getLensFixture('pregnancy');
      
      expect(lens.resourceType).toBe('Library');
      expect(lens.id).toBeDefined();
      expect(lens.name).toBeDefined();
      expect(lens.content).toBeDefined();
      expect(lens.content.length).toBeGreaterThan(0);
      expect(lens.content[0].contentType).toBe('application/javascript');
      expect(lens.content[0].data).toBeDefined();
    });

    test('conditions lens should have required fields', () => {
      const lens = getLensFixture('conditions');
      
      expect(lens.resourceType).toBe('Library');
      expect(lens.id).toBeDefined();
      expect(lens.name).toBeDefined();
      expect(lens.content).toBeDefined();
      expect(lens.content.length).toBeGreaterThan(0);
      expect(lens.content[0].contentType).toBe('application/javascript');
      expect(lens.content[0].data).toBeDefined();
    });

    test('extracted lens code should be valid JavaScript', () => {
      const lens = getLensFixture('pregnancy');
      const code = extractLensCode(lens);
      
      // Basic check: code should contain function syntax
      expect(code).toContain('enhance');
      expect(code).toContain('getSpecification');
    });
  });

  describe('Data Consistency Tests', () => {
    test('ePI, IPS, and PV should all be valid FHIR Bundles', () => {
      const epi = getEpiFixture('json');
      const ips = getIpsFixture();
      const pv = getPvFixture('json');
      
      [epi, ips, pv].forEach(bundle => {
        expect(bundle.resourceType).toBe('Bundle');
        expect(bundle.entry).toBeDefined();
        expect(Array.isArray(bundle.entry)).toBe(true);
        expect(bundle.entry.length).toBeGreaterThan(0);
      });
    });

    test('all fixtures should have proper FHIR structure', () => {
      const epi = getEpiFixture('json');
      const ips = getIpsFixture();
      const pv = getPvFixture('json');
      
      [epi, ips, pv].forEach(bundle => {
        bundle.entry.forEach((entry: any) => {
          expect(entry.resource).toBeDefined();
          expect(entry.resource.resourceType).toBeDefined();
        });
      });
    });
  });
});
