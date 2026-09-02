import { supabase } from './supabase';

export interface Employee {
  id: string;
  name: string;
  branch_id: string | null;
  pin: string;
  position: string | null;
  is_active: boolean;
  branch?: { id: string; name: string } | null;
}

export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_in_branch_id: string | null;
  check_out: string | null;
  check_out_branch_id: string | null;
  employee?: { name: string; position: string | null };
  check_in_branch?: { name: string } | null;
  check_out_branch?: { name: string } | null;
}

export const attendanceService = {
  async getEmployees(): Promise<Employee[]> {
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, branch_id, pin, position, is_active, branch:branches!branch_id(id, name)')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Employee[];
  },

  async getAllEmployees(): Promise<Employee[]> {
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, branch_id, pin, position, is_active, branch:branches!branch_id(id, name)')
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Employee[];
  },

  async createEmployee(input: { name: string; branch_id: string | null; pin: string; position: string | null }): Promise<void> {
    const { error } = await supabase.from('employees').insert({
      name: input.name,
      branch_id: input.branch_id || null,
      pin: input.pin,
      position: input.position || null,
    });
    if (error) throw new Error(error.message);
  },

  async updateEmployee(id: string, input: { name: string; branch_id: string | null; pin: string; position: string | null; is_active: boolean }): Promise<void> {
    const { error } = await supabase.from('employees').update({
      name: input.name,
      branch_id: input.branch_id || null,
      pin: input.pin,
      position: input.position || null,
      is_active: input.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteEmployee(id: string): Promise<void> {
    const { error } = await supabase.from('employees').update({ is_active: false }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getTodayAttendances(): Promise<Attendance[]> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('attendances')
      .select(`
        id, employee_id, date, check_in, check_in_branch_id, check_out, check_out_branch_id,
        employee:employees!employee_id(name, position),
        check_in_branch:branches!check_in_branch_id(name),
        check_out_branch:branches!check_out_branch_id(name)
      `)
      .eq('date', today)
      .order('check_in', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Attendance[];
  },

  async checkIn(employeeId: string, branchId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('attendances').upsert({
      employee_id: employeeId,
      date: today,
      check_in: new Date().toISOString(),
      check_in_branch_id: branchId,
    }, { onConflict: 'employee_id,date', ignoreDuplicates: false });
    if (error) throw new Error(error.message);
  },

  async checkOut(attendanceId: string, branchId: string): Promise<void> {
    const { error } = await supabase.from('attendances').update({
      check_out: new Date().toISOString(),
      check_out_branch_id: branchId,
      updated_at: new Date().toISOString(),
    }).eq('id', attendanceId);
    if (error) throw new Error(error.message);
  },

  verifyPin(employee: Employee, pin: string): boolean {
    return employee.pin === pin;
  },
};
