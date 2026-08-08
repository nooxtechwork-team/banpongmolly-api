import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { ActivityPackage } from '../entities/activity-package.entity';
import { ActivityPackagePrice } from '../entities/activity-package-price.entity';
import { CreateActivityPackageDto } from './dto/create-activity-package.dto';
import { UpdateActivityPackageDto } from './dto/update-activity-package.dto';
import { ActivityPackageGateway } from './activity-package.gateway';

export interface ActivityPackageWithPrice {
  id: number;
  name: string;
  slug: string | null;
  parent_id: number | null;
  sort_order: number;
  is_active: boolean;
  generation_id: number | null;
  gender_id: number | null;
  price?: number | null;
}

export interface ActivityPackageTreeNode extends ActivityPackageWithPrice {
  children: ActivityPackageTreeNode[];
}

/** slug แม่ (ถ้ามี) + slug ของโหนดลูกที่สมัคร */
export type PackageSlugChain = {
  parentSlug: string | null;
  leafSlug: string | null;
};

@Injectable()
export class ActivityPackageService {
  constructor(
    @InjectRepository(ActivityPackage)
    private readonly packageRepository: Repository<ActivityPackage>,
    @InjectRepository(ActivityPackagePrice)
    private readonly priceRepository: Repository<ActivityPackagePrice>,
    private readonly packageGateway: ActivityPackageGateway,
  ) {}

  /**
   * โหลด slug ของแพ็กเกจลูกและแม่ ครั้งเดียวต่อชุด leaf id (ใช้สร้างรหัสรายการสมัคร)
   */
  async findSlugChainsByLeafIds(
    leafIds: number[],
  ): Promise<Map<number, PackageSlugChain>> {
    const map = new Map<number, PackageSlugChain>();
    if (!leafIds.length) return map;
    const unique = [...new Set(leafIds)];
    const leaves = await this.packageRepository.find({
      where: { id: In(unique), deleted_at: IsNull() },
    });
    const parentIds = [
      ...new Set(
        leaves
          .map((l) => l.parent_id)
          .filter((id): id is number => id != null && !Number.isNaN(id)),
      ),
    ];
    const parents = parentIds.length
      ? await this.packageRepository.find({
          where: { id: In(parentIds), deleted_at: IsNull() },
        })
      : [];
    const parentById = new Map(parents.map((p) => [p.id, p]));
    for (const leaf of leaves) {
      const pslug =
        leaf.parent_id != null
          ? (parentById.get(leaf.parent_id)?.slug ?? null)
          : null;
      map.set(leaf.id, { parentSlug: pslug, leafSlug: leaf.slug ?? null });
    }
    return map;
  }

  /**
   * ชื่อของแพ็กเกจ (เฉพาะโหนดลูกสุดที่สมัคร) ตาม id — ไม่รวม path แม่ เพื่อให้สั้น
   * รวมแพ็กเกจที่ถูกลบไปแล้วด้วย เพื่อให้รายการเก่ายังแสดงชื่อได้
   */
  async findLeafNamesByIds(ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    const unique = [
      ...new Set(ids.filter((id) => Number.isFinite(id) && id > 0)),
    ];
    if (!unique.length) return out;
    const rows = await this.packageRepository.find({
      where: { id: In(unique) },
    });
    for (const row of rows) {
      if (row.name) out.set(row.id, row.name);
    }
    return out;
  }

  /**
   * คืน slug path สำหรับทำ entry_code แบบแม่ -> ลูก
   * ข้ามโหนดที่ไม่มี slug และ concat โดยไม่ใส่ตัวคั่น
   * เช่น (ไม่มี)/(A)/(ไม่มี)/(A1)/(O) => AA1O
   */
  async findSlugPathFromLayer2ByLeafIds(
    leafIds: number[],
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (!leafIds.length) return out;

    const unique = [...new Set(leafIds)];
    const visited = new Map<number, ActivityPackage>();
    let frontier = unique;

    // Load all ancestors needed for requested leaves.
    while (frontier.length) {
      const rows = await this.packageRepository.find({
        where: { id: In(frontier), deleted_at: IsNull() },
      });
      const next: number[] = [];
      for (const row of rows) {
        if (visited.has(row.id)) continue;
        visited.set(row.id, row);
        if (row.parent_id != null && !visited.has(row.parent_id)) {
          next.push(row.parent_id);
        }
      }
      frontier = [...new Set(next)];
    }

    for (const leafId of unique) {
      const path: string[] = [];
      let cur = visited.get(leafId);
      while (cur) {
        const slug = cur.slug?.trim();
        if (slug) path.push(slug);
        if (cur.parent_id == null) break;
        cur = visited.get(cur.parent_id);
      }
      if (!path.length) continue;
      const topToLeaf = path.reverse();
      const slugPath = topToLeaf.filter(Boolean).join('');
      out.set(leafId, slugPath);
    }

    return out;
  }

  async findAll(): Promise<ActivityPackageWithPrice[]> {
    const packages = await this.packageRepository.find({
      where: { deleted_at: IsNull() },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
    const prices = await this.priceRepository.find({
      where: { deleted_at: IsNull() },
    });
    const priceMap = new Map<number, number>();
    prices.forEach((p) => {
      if (!priceMap.has(p.package_id) && p.is_active) {
        priceMap.set(p.package_id, Number(p.amount));
      }
    });
    return packages.map((c) => ({
      ...c,
      price: priceMap.get(c.id) ?? null,
    }));
  }

  async findTree(): Promise<ActivityPackageTreeNode[]> {
    const packages = await this.findAll();
    const nodeMap = new Map<number, ActivityPackageTreeNode>();

    packages.forEach((c) => {
      nodeMap.set(c.id, {
        id: c.id,
        name: c.name,
        slug: c.slug,
        sort_order: c.sort_order,
        is_active: c.is_active,
        parent_id: c.parent_id,
        generation_id: c.generation_id ?? null,
        gender_id: c.gender_id ?? null,
        price: c.price ?? null,
        children: [],
      });
    });

    const roots: ActivityPackageTreeNode[] = [];
    nodeMap.forEach((node) => {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (nodes: ActivityPackageTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((n) => sortNodes(n.children));
    };

    sortNodes(roots);
    return roots;
  }

  /**
   * คืนค่าราคาต่ำสุดและสูงสุดจากโหนดลูก (leaf) ของ package ที่กำหนด
   * ใช้แสดงช่วงราคาในหน้า Activity Detail
   */
  async getLeafPriceRangeForPackage(
    packageId: number | null,
  ): Promise<{ min: number | null; max: number | null }> {
    if (packageId == null) {
      return { min: null, max: null };
    }
    const tree = await this.findTree();

    function findNode(
      nodes: ActivityPackageTreeNode[],
      id: number,
    ): ActivityPackageTreeNode | null {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = findNode(node.children, id);
        if (found) return found;
      }
      return null;
    }

    function collectLeafPrices(node: ActivityPackageTreeNode): number[] {
      if (node.children.length === 0) {
        const p = node.price;
        return p != null && typeof p === 'number' && !Number.isNaN(p)
          ? [p]
          : [];
      }
      return node.children.flatMap((c) => collectLeafPrices(c));
    }

    const node = findNode(tree, packageId);
    if (!node) return { min: null, max: null };

    const prices = collectLeafPrices(node);
    if (prices.length === 0) return { min: null, max: null };

    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }

  async create(dto: CreateActivityPackageDto): Promise<ActivityPackage> {
    const trimmedSlug = dto.slug?.trim();
    const pkg = this.packageRepository.create({
      name: dto.name,
      slug: trimmedSlug || null,
      parent_id: dto.parent_id ?? null,
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
      generation_id: dto.generation_id ?? null,
      gender_id: dto.gender_id ?? null,
    });
    const saved = await this.packageRepository.save(pkg);
    await this.setSinglePrice(saved.id, dto.price);
    return saved;
  }

  async bulkCreate(
    dtos: CreateActivityPackageDto[],
  ): Promise<{ created: number; items: ActivityPackage[] }> {
    const items: ActivityPackage[] = [];
    for (const dto of dtos) {
      items.push(await this.create(dto));
    }
    return { created: items.length, items };
  }

  async update(
    id: number,
    dto: UpdateActivityPackageDto,
  ): Promise<ActivityPackage> {
    const existing = await this.packageRepository.findOne({
      where: { id, deleted_at: IsNull() },
    });
    if (!existing) {
      throw new NotFoundException('ไม่พบแพ็กเกจ');
    }

    if (dto.name !== undefined) existing.name = dto.name;
    if (dto.slug !== undefined) {
      const trimmedSlug = dto.slug == null ? '' : String(dto.slug).trim();
      existing.slug = trimmedSlug || null;
    }
    if (dto.parent_id !== undefined) existing.parent_id = dto.parent_id ?? null;
    if (dto.sort_order !== undefined) existing.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) existing.is_active = dto.is_active;
    if (dto.generation_id !== undefined) {
      existing.generation_id = dto.generation_id ?? null;
    }
    if (dto.gender_id !== undefined) {
      existing.gender_id = dto.gender_id ?? null;
    }

    const saved = await this.packageRepository.save(existing);
    if (dto.price !== undefined) {
      await this.setSinglePrice(saved.id, dto.price);
    }
    return saved;
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.packageRepository.findOne({
      where: { id, deleted_at: IsNull() },
    });
    if (!existing) {
      throw new NotFoundException('ไม่พบแพ็กเกจ');
    }
    existing.deleted_at = new Date();
    await this.packageRepository.save(existing);

    const prices = await this.priceRepository.find({
      where: { package_id: id, deleted_at: IsNull() },
    });
    for (const price of prices) {
      price.deleted_at = new Date();
      await this.priceRepository.save(price);
    }
    await this.emitPriceUpdated(id, null);
  }

  /**
   * ตั้งราคาเดียวกันทั้งชุดแพ็กเกจ (root + ลูกหลานทั้งหมด)
   * อัปเดตเฉพาะรายการที่มีราคาอยู่แล้ว — ไม่สร้างราคาใหม่ให้รายการที่ยังไม่เคยตั้ง
   */
  async bulkUpdateExistingPrices(
    rootPackageId: number,
    amount: number,
  ): Promise<{ updated: number; skipped: number; price: number }> {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    }
    const nextAmount = Number(amount);

    const root = await this.packageRepository.findOne({
      where: { id: rootPackageId, deleted_at: IsNull() },
    });
    if (!root) {
      throw new NotFoundException('ไม่พบแพ็กเกจ');
    }

    const packageIds = await this.collectSubtreePackageIds(rootPackageId);
    if (!packageIds.length) {
      return { updated: 0, skipped: 0, price: nextAmount };
    }

    const prices = await this.priceRepository.find({
      where: {
        package_id: In(packageIds),
        deleted_at: IsNull(),
      },
    });

    let updated = 0;
    for (const price of prices) {
      const prev = Number(price.amount);
      if (prev === nextAmount && price.is_active) {
        continue;
      }
      price.amount = nextAmount;
      price.is_active = true;
      await this.priceRepository.save(price);
      updated += 1;
      if (prev !== nextAmount) {
        await this.emitPriceUpdated(price.package_id, nextAmount);
      }
    }

    const skipped = packageIds.length - prices.length;
    return { updated, skipped, price: nextAmount };
  }

  /** รวม id ของโหนดรากและลูกหลานทั้งหมดในชุด */
  private async collectSubtreePackageIds(rootId: number): Promise<number[]> {
    const packages = await this.packageRepository.find({
      where: { deleted_at: IsNull() },
      select: ['id', 'parent_id'],
    });
    const childrenByParent = new Map<number, number[]>();
    for (const pkg of packages) {
      if (pkg.parent_id == null) continue;
      const list = childrenByParent.get(pkg.parent_id) ?? [];
      list.push(pkg.id);
      childrenByParent.set(pkg.parent_id, list);
    }

    const out: number[] = [];
    const stack = [rootId];
    const seen = new Set<number>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      const kids = childrenByParent.get(id);
      if (kids?.length) stack.push(...kids);
    }
    return out;
  }

  private async setSinglePrice(
    packageId: number,
    amount?: number | null,
  ): Promise<void> {
    const existing = await this.priceRepository.findOne({
      where: { package_id: packageId, deleted_at: IsNull() },
    });

    const previousAmount =
      existing != null ? Number(existing.amount) : null;
    const nextAmount =
      amount === undefined || amount === null ? null : Number(amount);

    if (amount === undefined || amount === null) {
      if (existing) {
        existing.deleted_at = new Date();
        await this.priceRepository.save(existing);
        await this.emitPriceUpdated(packageId, null);
      }
      return;
    }

    if (existing) {
      existing.amount = amount;
      existing.is_active = true;
      await this.priceRepository.save(existing);
      if (previousAmount !== nextAmount) {
        await this.emitPriceUpdated(packageId, nextAmount);
      }
      return;
    }

    const price = this.priceRepository.create({
      package_id: packageId,
      amount,
      is_active: true,
    });
    await this.priceRepository.save(price);
    await this.emitPriceUpdated(packageId, nextAmount);
  }

  private async findPackageRootId(packageId: number): Promise<number> {
    let current = await this.packageRepository.findOne({
      where: { id: packageId, deleted_at: IsNull() },
    });
    if (!current) return packageId;

    // ป้องกันวน loop ถ้าข้อมูล parent พัง
    for (let i = 0; i < 64 && current.parent_id; i += 1) {
      const parent = await this.packageRepository.findOne({
        where: { id: current.parent_id, deleted_at: IsNull() },
      });
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }

  private async emitPriceUpdated(
    packageId: number,
    amount: number | null,
  ): Promise<void> {
    try {
      const rootId = await this.findPackageRootId(packageId);
      this.packageGateway.notifyPackageTreePricesUpdated(
        rootId,
        packageId,
        amount,
      );
    } catch {
      // realtime เป็น best-effort — ไม่ให้กระทบการบันทึกราคา
    }
  }
}
