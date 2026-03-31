import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { ActivityPackage } from '../entities/activity-package.entity';
import { ActivityPackagePrice } from '../entities/activity-package-price.entity';
import { CreateActivityPackageDto } from './dto/create-activity-package.dto';
import { UpdateActivityPackageDto } from './dto/update-activity-package.dto';

export interface ActivityPackageWithPrice {
  id: number;
  name: string;
  slug: string | null;
  parent_id: number | null;
  sort_order: number;
  is_active: boolean;
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
    });
    const saved = await this.packageRepository.save(pkg);
    await this.setSinglePrice(saved.id, dto.price);
    return saved;
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
  }

  private async setSinglePrice(
    packageId: number,
    amount?: number | null,
  ): Promise<void> {
    const existing = await this.priceRepository.findOne({
      where: { package_id: packageId, deleted_at: IsNull() },
    });

    if (amount === undefined || amount === null) {
      if (existing) {
        existing.deleted_at = new Date();
        await this.priceRepository.save(existing);
      }
      return;
    }

    if (existing) {
      existing.amount = amount;
      existing.is_active = true;
      await this.priceRepository.save(existing);
      return;
    }

    const price = this.priceRepository.create({
      package_id: packageId,
      amount,
      is_active: true,
    });
    await this.priceRepository.save(price);
  }
}
